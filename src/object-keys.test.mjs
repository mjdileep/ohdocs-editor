import test from 'node:test'
import assert from 'node:assert/strict'
import { getSchema, Node } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { EditorState, NodeSelection, TextSelection } from '@tiptap/pm/state'
import { history, undoDepth } from '@tiptap/pm/history'
import { placementAttributes } from './placement.js'
import { objectKeyDown, nudgedPlacement, nudge } from './object-keys.js'

const Attachment = Node.create({ name: 'previewAttachment', group: 'block', atom: true, selectable: true, addAttributes: () => ({ label: { default: 'Image' }, ...placementAttributes }) })
const schema = getSchema([StarterKit, Attachment])
const placed = (offset, gap, layer, label) => ({ type: 'previewAttachment', attrs: { label, layout: 'canvas', offset, gap, layer, canvasWidth: 200 } })
const doc = schema.nodeFromJSON({ type: 'doc', content: [
  { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
  placed(10, 40, 1, 'Photo'),
  placed(15, 80, 2, 'Drawing'),
  { type: 'paragraph', content: [{ type: 'text', text: 'After' }] },
] })
const photoAt = doc.child(0).nodeSize, drawingAt = photoAt + doc.child(1).nodeSize

// Just enough of an EditorView: an 800px page where the two objects overlap.
function view(selected = photoAt, width = 800) {
  const rects = { [photoAt]: { left: 80, top: 40, right: 280, bottom: 240 }, [drawingAt]: { left: 120, top: 80, right: 320, bottom: 280 } }
  const state = EditorState.create({ doc, plugins: [history()], selection: selected === null ? TextSelection.create(doc, 2) : NodeSelection.create(doc, selected) })
  const fake = { state, editable: true, blurred: false,
    dom: { clientWidth: width, blur() { fake.blurred = true } },
    nodeDOM: pos => ({ offsetWidth: 200, getBoundingClientRect: () => rects[pos] }),
    dispatch(tr) { fake.state = fake.state.apply(tr) } }
  return fake
}
const key = (name, extra = {}) => ({ key: name, code: { ']': 'BracketRight', '[': 'BracketLeft', d: 'KeyD' }[name] ?? name, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, isComposing: false, defaultPrevented: false, ...extra })
const attrs = (v, pos) => v.state.doc.nodeAt(pos).attrs

test('Escape lets go of a selected object without touching text selections', () => {
  const v = view()
  assert.equal(objectKeyDown(v, key('Escape'), true), true)
  assert.ok(v.state.selection instanceof TextSelection)
  assert.equal(v.blurred, true)
  const text = view(null)
  assert.equal(objectKeyDown(text, key('Escape'), true), false)
})

test('arrow keys move a placed object 1px, Shift 10px, and it stays on the page', () => {
  const v = view()
  assert.equal(objectKeyDown(v, key('ArrowRight'), true), true)
  assert.equal(attrs(v, photoAt).offset, 10.13)
  objectKeyDown(v, key('ArrowDown', { shiftKey: true }), true)
  assert.equal(attrs(v, photoAt).gap, 50)
  assert.ok(v.state.selection instanceof NodeSelection && v.state.selection.from === photoAt, 'the object stays selected')
  assert.deepEqual(nudgedPlacement({ offset: 70, gap: 5 }, 800, 200, 500, -50), { offset: 75, gap: 0 })
})

test('a quick run of nudges undoes as one step; a pause starts a new one', () => {
  const v = view()
  nudge(v, 1, 0, 1000); nudge(v, 1, 0, 1100); nudge(v, 1, 0, 1200)
  assert.equal(undoDepth(v.state), 1)
  nudge(v, 1, 0, 2500)
  assert.equal(undoDepth(v.state), 2)
})

test('arrow keys keep their usual meaning on narrow pages and for objects in the text flow', () => {
  assert.equal(objectKeyDown(view(photoAt, 500), key('ArrowRight'), true), false)
  const inline = schema.nodeFromJSON({ type: 'doc', content: [{ type: 'previewAttachment', attrs: { label: 'Inline' } }, { type: 'paragraph' }] })
  const v = view(); v.state = EditorState.create({ doc: inline, selection: NodeSelection.create(inline, 0) })
  assert.equal(objectKeyDown(v, key('ArrowRight'), true), false)
})

test('Mod+] and Mod+[ restack overlapping objects; with Shift they go to the front or back', () => {
  const v = view()
  assert.equal(objectKeyDown(v, key(']', { metaKey: true }), true), true)
  assert.deepEqual([attrs(v, photoAt).layer, attrs(v, drawingAt).layer], [2, 1])
  objectKeyDown(v, key('[', { metaKey: true, shiftKey: true }), true)
  assert.deepEqual([attrs(v, photoAt).layer, attrs(v, drawingAt).layer], [1, 2])
  assert.ok(v.state.selection instanceof NodeSelection && v.state.selection.from === photoAt)
  // Windows and Linux use Ctrl; the key is still claimed when nothing can change.
  assert.equal(objectKeyDown(v, key('[', { ctrlKey: true }), false), true)
  // Layouts without a physical bracket key still type the character.
  objectKeyDown(v, key(']', { metaKey: true, code: '' }), true)
  assert.deepEqual([attrs(v, photoAt).layer, attrs(v, drawingAt).layer], [2, 1])
})

test('Mod+D duplicates the object just after itself, offset and on top, and selects the copy', () => {
  const v = view()
  assert.equal(objectKeyDown(v, key('d', { metaKey: true }), true), true)
  const copyAt = drawingAt, copy = attrs(v, copyAt)
  assert.equal(copy.label, 'Photo')
  assert.deepEqual([copy.offset, copy.gap, copy.layer], [12, 56, 3])
  assert.ok(v.state.selection instanceof NodeSelection && v.state.selection.from === copyAt)
  assert.equal(objectKeyDown(view(), key('d', { ctrlKey: true }), true), false, 'Ctrl+D on a Mac is not ours')
})
