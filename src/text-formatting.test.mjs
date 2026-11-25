import test from 'node:test'
import assert from 'node:assert/strict'
import { getSchema } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import { EditorState, TextSelection, NodeSelection } from '@tiptap/pm/state'
import { CellSelection } from '@tiptap/pm/tables'
import { history, undo, redo, closeHistory } from '@tiptap/pm/history'
import { TextStyle, TextHighlight, textFormattingTransaction, selectedTextFormatting } from './text-formatting.js'

const schema = getSchema([StarterKit, TableKit, TextStyle, TextHighlight])
const text = (value, attrs, extra = []) => schema.text(value, [...(attrs ? [schema.marks.textStyle.create(attrs)] : []), ...extra])
const paragraph = (...content) => schema.nodes.paragraph.create(null, content)
const doc = (...content) => schema.nodes.doc.create(null, content)
const stateFor = (document, from, to = from) => EditorState.create({ doc: document, selection: TextSelection.create(document, from, to), plugins: [history()] })
const attrs = node => node.marks.find(mark => mark.type.name === 'textStyle')?.attrs

test('clipboard spans keep inherited color when an inner span changes only size', () => {
  const rule = schema.marks.textStyle.spec.parseDOM[0]
  const parentElement = { style: { color: 'rgb(21, 128, 61)', fontSize: '12pt' } }
  assert.deepEqual(rule.getAttrs({ style: { fontSize: '20pt' }, parentElement }), { color: '#15803d', fontSize: '20pt' })
  assert.deepEqual(rule.getAttrs({ style: { color: '#b91c1c' }, parentElement }), { color: '#b91c1c', fontSize: '12pt' })
})

test('color changes preserve mixed sizes, other marks and unselected text; reset removes only color', () => {
  let state = stateFor(doc(paragraph(text('A', { fontSize: '10pt' }), text('B', { fontSize: '24pt' }, [schema.marks.bold.create()]), text('C'))), 1, 3)
  assert.equal(selectedTextFormatting(state).fontSize, 'mixed')
  state = state.apply(textFormattingTransaction(state, 'color', '#1d4ed8'))
  assert.equal(attrs(state.doc.nodeAt(1)).fontSize, '10pt')
  assert.equal(attrs(state.doc.nodeAt(2)).fontSize, '24pt')
  assert.ok(schema.marks.bold.isInSet(state.doc.nodeAt(2).marks))
  assert.equal(attrs(state.doc.nodeAt(3)), undefined)
  assert.equal(selectedTextFormatting(state).color, '#1d4ed8')
  state = state.apply(textFormattingTransaction(state, 'color', null))
  assert.equal(attrs(state.doc.nodeAt(1)).color, null)
  assert.equal(attrs(state.doc.nodeAt(2)).fontSize, '24pt')
})

test('font size and background combine, survive JSON, and undo separately from typing', () => {
  let state = stateFor(doc(paragraph(text('Hello'))), 6)
  const dispatch = tr => { state = state.apply(tr) }
  dispatch(state.tr.insertText('!'))
  const typed = state.doc
  dispatch(state.tr.setSelection(TextSelection.create(state.doc, 1, 7)))
  dispatch(textFormattingTransaction(state, 'fontSize', '24'))
  dispatch(closeHistory(state.tr))
  const sized = state.doc
  dispatch(textFormattingTransaction(state, 'backgroundColor', '#ffe680'))
  dispatch(closeHistory(state.tr))
  const colored = state.doc
  assert.deepEqual(selectedTextFormatting(state), { color: null, backgroundColor: '#ffe680', fontSize: '24pt' })
  assert.ok(schema.nodeFromJSON(colored.toJSON()).eq(colored))
  undo(state, dispatch); assert.ok(state.doc.eq(sized))
  undo(state, dispatch); assert.ok(state.doc.eq(typed))
  redo(state, dispatch); redo(state, dispatch); assert.ok(state.doc.eq(colored))
  dispatch(textFormattingTransaction(state, 'backgroundColor', null))
  assert.equal(schema.marks.highlight.isInSet(state.doc.nodeAt(1).marks), undefined)
  assert.equal(attrs(state.doc.nodeAt(1)).fontSize, '24pt')
})

test('formatting at the caret applies to subsequent typing and can clear the last style', () => {
  let state = stateFor(doc(paragraph()), 1)
  state = state.apply(textFormattingTransaction(state, 'color', '#15803d'))
  state = state.apply(textFormattingTransaction(state, 'fontSize', '18pt'))
  state = state.apply(state.tr.insertText('Green'))
  assert.deepEqual({ ...attrs(state.doc.nodeAt(1)) }, { color: '#15803d', fontSize: '18pt' })
  state = state.apply(textFormattingTransaction(state, 'color', null))
  state = state.apply(textFormattingTransaction(state, 'fontSize', null))
  state = state.apply(state.tr.insertText(' plain'))
  assert.equal(state.doc.nodeAt(6).marks.length, 0)
})

test('formatting a cell selection changes only the selected column', () => {
  const cell = value => schema.nodes.tableCell.create(null, paragraph(text(value)))
  const row = (...values) => schema.nodes.tableRow.create(null, values.map(cell))
  const document = doc(schema.nodes.table.create(null, [row('A', 'B'), row('C', 'D')]))
  const positions = []
  document.descendants((node, pos) => { if (node.type.name === 'tableCell') positions.push(pos) })
  let state = EditorState.create({ doc: document, selection: CellSelection.create(document, positions[0], positions[2]) })
  state = state.apply(textFormattingTransaction(state, 'backgroundColor', '#bbf7d0'))
  const highlighted = []
  state.doc.descendants(node => { if (node.isText && schema.marks.highlight.isInSet(node.marks)) highlighted.push(node.text) })
  assert.deepEqual(highlighted, ['A', 'C'])
})

test('formatting rejects invalid values and leaves code and selected objects alone', () => {
  let state = stateFor(doc(paragraph(text('Code', null, [schema.marks.code.create()]))), 1, 5)
  assert.equal(textFormattingTransaction(state, 'color', 'url(https://example.com)'), null)
  assert.equal(textFormattingTransaction(state, 'fontSize', '999pt'), null)
  assert.ok(state.apply(textFormattingTransaction(state, 'color', '#fff')).doc.eq(state.doc))
  state = EditorState.create({ doc: state.doc, selection: NodeSelection.create(state.doc, 0) })
  assert.equal(textFormattingTransaction(state, 'fontSize', '24pt'), null)
})
