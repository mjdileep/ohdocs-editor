import test from 'node:test'
import assert from 'node:assert/strict'
import { getSchema, Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { CellSelection } from '@tiptap/pm/tables'
import { history, undo, redo, closeHistory } from '@tiptap/pm/history'
import { TableAppearance, backgroundCells, cellBackgroundTransaction, selectedCellBackground } from './table-appearance.js'
import { TextHighlight } from './text-formatting.js'
import { insertDivider } from './editor-insertions.js'

const schema = getSchema([StarterKit, TableKit, TableAppearance, TextHighlight])
const cell = (label, attrs = {}, header = false) => schema.nodes[header ? 'tableHeader' : 'tableCell'].create(attrs, schema.nodes.paragraph.create(null, schema.text(label)))
const row = (...cells) => schema.nodes.tableRow.create(null, cells)
const doc = (...rows) => schema.nodes.doc.create(null, schema.nodes.table.create(null, rows))
const simple = () => doc(row(cell('A', {}, true), cell('B', {}, true), cell('C', {}, true)), row(cell('D'), cell('E', { colwidth: [120] }), cell('F')), row(cell('G'), cell('H'), cell('I')))
const posOf = (doc, label) => { let found; doc.descendants((node, pos) => { if (['cell','header_cell'].includes(node.type.spec.tableRole) && node.textContent === label) found = pos }); return found }
const at = (doc, label) => EditorState.create({ doc, selection: TextSelection.create(doc, posOf(doc, label) + 2), plugins: [history()] })
const filled = state => { const labels = []; state.doc.descendants(node => { if (node.attrs.backgroundColor) labels.push(node.textContent) }); return labels }

test('cell, row, column and table fills touch exactly the requested cells, including headers', () => {
  for (const [scope, expected] of [['cell',['E']],['row',['D','E','F']],['column',['B','E','H']],['table',['A','B','C','D','E','F','G','H','I']]]) {
    let state = at(simple(), 'E')
    state = state.apply(cellBackgroundTransaction(state, scope, '#bbf7d0'))
    assert.deepEqual(filled(state), expected)
    assert.equal(state.doc.nodeAt(posOf(state.doc, 'E')).attrs.colwidth[0], 120)
    assert.equal(state.doc.textContent, 'ABCDEFGHI')
  }
})

test('multi-cell backgrounds, reset, persistence and undo preserve cell content and geometry', () => {
  const document = simple()
  let state = EditorState.create({ doc: document, selection: CellSelection.create(document, posOf(document, 'E'), posOf(document, 'I')), plugins: [history()] })
  const dispatch = tr => { state = state.apply(tr) }
  dispatch(cellBackgroundTransaction(state, 'cell', '#bfdbfe')); dispatch(closeHistory(state.tr))
  assert.deepEqual(filled(state), ['E','F','H','I'])
  const colored = state.doc
  assert.ok(schema.nodeFromJSON(colored.toJSON()).eq(colored))
  dispatch(cellBackgroundTransaction(state, 'row', null)); dispatch(closeHistory(state.tr))
  assert.deepEqual(filled(state), [])
  undo(state, dispatch); assert.ok(state.doc.eq(colored))
  undo(state, dispatch); assert.ok(state.doc.eq(document))
  redo(state, dispatch); assert.ok(state.doc.eq(colored))
  assert.equal(selectedCellBackground(state, 'cell'), '#bfdbfe')
  assert.equal(selectedCellBackground(state, 'table'), 'mixed')
})

test('row and column fills include intersecting merged cells once without changing their spans', () => {
  const merged = doc(row(cell('A', { colspan: 2, rowspan: 2 }), cell('B')), row(cell('C')), row(cell('D'), cell('E'), cell('F')))
  for (const [label, scope, expected] of [['C','row',['A','C']],['E','column',['A','E']]]) {
    let state = at(merged, label)
    assert.equal(backgroundCells(state, scope).length, 2)
    const tr = cellBackgroundTransaction(state, scope, '#ffe680')
    assert.equal(tr.steps.length, 2)
    state = state.apply(tr)
    assert.deepEqual(filled(state), expected)
    assert.equal(state.doc.nodeAt(posOf(state.doc,'A')).attrs.rowspan, 2)
    assert.equal(state.doc.nodeAt(posOf(state.doc,'A')).attrs.colspan, 2)
  }
})

test('cell fills reject unsafe colors, survive saved JSON and are not pasted as text highlights', () => {
  const state = at(simple(), 'E')
  assert.equal(cellBackgroundTransaction(state, 'row', 'url(https://example.com)'), null)
  const colored = state.apply(cellBackgroundTransaction(state, 'column', '#fed7aa')).doc
  assert.ok(schema.nodeFromJSON(colored.toJSON()).eq(colored))
  const rule = schema.marks.highlight.spec.parseDOM.find(rule => rule.tag === '[style]')
  assert.equal(rule.getAttrs({ tagName: 'TD', style: { backgroundColor: 'rgb(254, 215, 170)' } }), false)
  assert.equal(rule.getAttrs({ tagName: 'TR', style: { backgroundColor: '#fed7aa' } }), false)
})

test('dividers split at the caret and preserve selected words after the divider', () => {
  for (const selection of [6, {from:6,to:11}]) {
    const editor = new Editor({ element: null, extensions: [StarterKit], content: { type:'doc', content:[{type:'paragraph',content:[{type:'text',text:'Left Right'}]}] } })
    editor.commands.setTextSelection(selection)
    assert.equal(insertDivider(editor.chain()).run(), true)
    const nodes = editor.getJSON().content
    assert.deepEqual(nodes.map(node => node.type), ['paragraph','horizontalRule','paragraph'])
    assert.equal(nodes[0].content[0].text, 'Left ')
    assert.equal(nodes[2].content[0].text, 'Right')
    assert.equal(editor.state.selection.$from.parent.textContent, 'Right')
    editor.destroy()
  }
})
