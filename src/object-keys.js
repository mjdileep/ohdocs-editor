import { Extension } from '@tiptap/core'
import { Plugin, NodeSelection, TextSelection } from '@tiptap/pm/state'
import { closeHistory } from '@tiptap/pm/history'
import { rounded } from './canvas-layout.js'
import { isMacPlatform } from './editor-shortcuts.js'
import { restack, stackable, topLayer } from './object-stacking.js'

// Keyboard shortcuts for a selected object (image, drawing, video, file, table
// or code block):
//   Escape                 let go of the selection
//   Arrow keys             move a placed object 1px (Shift: 10px)
//   Mod+] / Mod+[          bring forward / send backward
//   Mod+Shift+] / Mod+Shift+[   bring to front / send to back
//   Mod+D                  duplicate
// Delete, Backspace, copy, cut, paste and undo keep their usual editor behaviour.
export const objectShortcutLabels = mac => mac
  ? { front: '⇧⌘]', forward: '⌘]', backward: '⌘[', back: '⇧⌘[', duplicate: '⌘D' }
  : { front: 'Ctrl+Shift+]', forward: 'Ctrl+]', backward: 'Ctrl+[', back: 'Ctrl+Shift+[', duplicate: 'Ctrl+D' }

const objects = ['previewAttachment', 'table', 'codeBlock']
export const selectedObject = state => state.selection instanceof NodeSelection && objects.includes(state.selection.node.type.name) ? state.selection : null
// Placed objects move freely only on pages wide enough for the canvas layout.
const onCanvas = (view, node) => stackable(node) && view.dom.clientWidth > 560

// Let go of a selected object: the caret goes to the nearest text without
// scrolling, and the editor gives up the keyboard, so typing goes nowhere unseen.
export function deselect(view) {
  const selection = selectedObject(view.state)
  if (!selection) return false
  const $at = view.state.doc.resolve(selection.from)
  const caret = TextSelection.findFrom($at, -1, true) || TextSelection.findFrom($at, 1, true)
  if (caret) view.dispatch(view.state.tr.setSelection(caret).setMeta('addToHistory', false))
  view.dom.blur()
  return true
}

// Where a placed object lands after moving it by dx, dy pixels on a page
// `pageWidth` wide. It stays on the page; `width` is the object's width.
export function nudgedPlacement(attrs, pageWidth, width, dx, dy) {
  const x = (Number(attrs.offset) || 0) * pageWidth / 100
  const next = Math.max(0, Math.min(Math.max(0, pageWidth - width), x + dx))
  return { offset: rounded(next / pageWidth * 100), gap: rounded(Math.max(0, (Number(attrs.gap) || 0) + dy)) }
}

const nudges = new WeakMap()
// A run of nudges undoes as one step; pausing for a moment starts a new one.
export function nudge(view, dx, dy, now = performance.now()) {
  const selection = selectedObject(view.state)
  if (!selection || !view.editable || !onCanvas(view, selection.node)) return false
  const { node, from } = selection, pageWidth = view.dom.clientWidth
  const width = Number(node.attrs.canvasWidth) || view.nodeDOM(from)?.offsetWidth || 0
  const next = nudgedPlacement(node.attrs, pageWidth, width, dx, dy)
  // At the edge of the page there is nowhere to go, but the key is still ours.
  if (next.offset === node.attrs.offset && next.gap === node.attrs.gap) return true
  let tr = view.state.tr
  if (now - (nudges.get(view) ?? -Infinity) > 600) tr = closeHistory(tr)
  nudges.set(view, now)
  tr.setNodeMarkup(from, null, { ...node.attrs, ...next })
  view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, from)))
  return true
}

// Duplicate the selected object right after itself. A placed copy sits 16px
// down and right, above everything else, ready to drag away.
export function duplicateObject(view) {
  const selection = selectedObject(view.state)
  if (!selection || !view.editable) return false
  const { node, from } = selection
  let attrs = node.attrs
  if (onCanvas(view, node)) {
    const width = Number(attrs.canvasWidth) || view.nodeDOM(from)?.offsetWidth || 0
    attrs = { ...attrs, ...nudgedPlacement(attrs, view.dom.clientWidth, width, 16, 16), layer: topLayer(view) + 1 }
  }
  const at = from + node.nodeSize
  const tr = closeHistory(view.state.tr).insert(at, node.type.create(attrs, node.content, node.marks))
  view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, at)))
  view.dispatch(closeHistory(view.state.tr))
  return true
}

const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

export function objectKeyDown(view, event, mac = isMacPlatform()) {
  if (event.isComposing || event.defaultPrevented || !selectedObject(view.state)) return false
  const mod = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
  const plain = !mod && !event.metaKey && !event.ctrlKey && !event.altKey
  if (event.key === 'Escape' && plain && !event.shiftKey) return deselect(view)
  if (arrows[event.key] && plain) {
    const [x, y] = arrows[event.key], step = event.shiftKey ? 10 : 1
    return nudge(view, x * step, y * step)
  }
  if (!mod || event.altKey) return false
  // The bracket keys by position, or by the character they type on other layouts.
  const bracket = event.code === 'BracketRight' || event.key === ']' || event.key === '}' ? 'right'
    : event.code === 'BracketLeft' || event.key === '[' || event.key === '{' ? 'left' : null
  if (bracket) {
    const up = bracket === 'right'
    restack(view, view.state.selection.from, event.shiftKey ? (up ? 'front' : 'back') : (up ? 'forward' : 'backward'))
    // Even when the order cannot change, keep the browser from going back or forward.
    return true
  }
  if (!event.shiftKey && (event.code === 'KeyD' || event.key.toLowerCase() === 'd')) return duplicateObject(view)
  return false
}

export const ObjectKeys = Extension.create({
  name: 'objectKeys',
  // Ahead of the table, list and default keymaps, which would otherwise move the selection.
  priority: 1050,
  addProseMirrorPlugins() {
    return [new Plugin({ props: { handleKeyDown: (view, event) => objectKeyDown(view, event) } })]
  },
})
