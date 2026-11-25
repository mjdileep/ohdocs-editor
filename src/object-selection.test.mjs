import test from 'node:test'
import assert from 'node:assert/strict'
import { getSchema, Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import { EditorState, NodeSelection, TextSelection } from '@tiptap/pm/state'
import { CellSelection, tableEditing } from '@tiptap/pm/tables'
import { history, undo, redo, closeHistory } from '@tiptap/pm/history'
import { selectObject, removeObject } from './object-selection.js'
import { NoteDivider } from './divider.js'
import { canDragTableSurface, NoteTable } from './note-table.js'
import { drawingSVG, makeStroke } from '../format/drawing.mjs'
import { insertDivider } from './editor-insertions.js'

const schema=getSchema([StarterKit.configure({horizontalRule:false}),NoteDivider,TableKit])
const p=text=>schema.nodes.paragraph.create(null,text?schema.text(text):null)
const cell=text=>schema.nodes.tableCell.create(null,p(text))
const table=schema.nodes.table.create(null,[schema.nodes.tableRow.create(null,[cell('Alpha'),cell('Beta')])])
const doc=schema.nodes.doc.create(null,[p('Before'),schema.nodes.horizontalRule.create(),table,p('After')])
const dividerPos=8,tablePos=9

test('direct selection and removal delete just the intended object with separate undo/redo',()=>{
  for(const pos of [dividerPos,tablePos]){
    let state=EditorState.create({doc,plugins:[history()]})
    const view={get state(){return state},editable:true,dispatch(tr){state=state.apply(tr)},focus(){}}
    view.dispatch(state.tr.insertText('!',2));view.dispatch(closeHistory(state.tr))
    const before=state.doc,at=pos+1
    assert.equal(selectObject(view,()=>at),true)
    assert.ok(state.selection instanceof NodeSelection)
    assert.equal(removeObject(view,()=>at),true)
    const after=state.doc
    assert.equal(after.childCount,3)
    assert.equal(after.textContent,pos===dividerPos?'B!eforeAlphaBetaAfter':'B!eforeAfter')
    undo(state,tr=>view.dispatch(tr));assert.ok(state.doc.eq(before))
    redo(state,tr=>view.dispatch(tr));assert.ok(state.doc.eq(after))
    view.editable=false
    assert.equal(removeObject(view,()=>0),false)
    assert.equal(selectObject(view,()=>0),false)
    view.editable=true
    assert.equal(removeObject(view,()=>undefined),false)
  }
})

test('custom divider keeps native markdown/HTML and inserts at the caret',()=>{
  const editor=new Editor({element:null,extensions:[StarterKit.configure({horizontalRule:false}),NoteDivider],content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Left Right'}]}]}})
  editor.commands.setTextSelection(6)
  assert.equal(insertDivider(editor.chain()).run(),true)
  assert.deepEqual(editor.getJSON().content.map(node=>node.type),['paragraph','horizontalRule','paragraph'])
  assert.deepEqual(schema.nodes.horizontalRule.spec.toDOM(schema.nodes.horizontalRule.create()),['hr',{}])
  editor.destroy()
})

test('table drag arbitration preserves editing, multi-cell selection, resizing and modified gestures',t=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'document')
  Object.defineProperty(globalThis,'document',{configurable:true,value:{activeElement:null}})
  t.after(()=>original?Object.defineProperty(globalThis,'document',original):delete globalThis.document)
  const tableDOM={contains:()=>false}
  const cellDOM={closest:()=>tableDOM,getBoundingClientRect:()=>({left:100,right:220})}
  const target={closest:selector=>selector==='td,th'?cellDOM:null}
  let state=EditorState.create({doc,selection:TextSelection.create(doc,1)}),focused=true
  const view={get state(){return state},hasFocus:()=>focused}
  const can=(event={clientX:150},element=target)=>canDragTableSurface(view,tablePos,tableDOM,element,event)
  assert.equal(can(),true,'any non-control surface can start a drag when the caret is outside')
  state=state.apply(state.tr.setSelection(TextSelection.create(doc,tablePos+4)))
  assert.equal(can(),false,'a caret inside the table preserves text selection')
  state=state.apply(state.tr.setSelection(CellSelection.create(doc,tablePos+2)))
  assert.equal(can(),false,'cell selections retain their own gestures')
  state=state.apply(state.tr.setSelection(NodeSelection.create(doc,tablePos)))
  assert.equal(can(),true,'a whole selected table can be moved from anywhere')
  for(const event of [{clientX:102},{clientX:218},{clientX:150,shiftKey:true},{clientX:150,metaKey:true},{clientX:150,ctrlKey:true}])assert.equal(can(event),false)
  assert.equal(can({clientX:150,altKey:true}),true,'Alt still bypasses snapping')
  assert.equal(can({clientX:150},{closest:()=>({})}),false,'controls and nested media stay interactive')
  focused=false
  state=state.apply(state.tr.setSelection(TextSelection.create(doc,tablePos+4)))
  assert.equal(can(),true,'leaving the editor allows arranging the table again')
})

test('the table plugin keeps a moved table selected as an object, not a range of cells',()=>{
  let state=EditorState.create({doc,plugins:[tableEditing({allowTableNodeSelection:NoteTable.options.allowTableNodeSelection})]})
  state=state.applyTransaction(state.tr.setSelection(NodeSelection.create(doc,tablePos))).state
  assert.ok(state.selection instanceof NodeSelection)
  assert.equal(state.selection.node.type.name,'table')
})

test('thin strokes get an editor-only hit path that stays wide when scaled',()=>{
  const {drawing}=makeStroke([[20,20],[100,50]],1,'#123456',1)
  const publicSVG=drawingSVG(drawing),editorSVG=drawingSVG(drawing,{interactive:true})
  assert.doesNotMatch(publicSVG,/fn-ink-hit/)
  assert.match(editorSVG,/class="fn-ink-hit"[^>]+stroke="transparent"[^>]+vector-effect="non-scaling-stroke"/)
  assert.match(editorSVG,/stroke="#123456" stroke-width="1"/)
  assert.equal((editorSVG.match(/<path /g)||[]).length,2)
})
