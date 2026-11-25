import test from 'node:test'
import assert from 'node:assert/strict'
import { Schema } from '@tiptap/pm/model'
import { EditorState, TextSelection, NodeSelection } from '@tiptap/pm/state'
import { history, undo, redo } from '@tiptap/pm/history'
import { deleteAcrossObjects } from './object-deletion.js'
const schema=new Schema({nodes:{doc:{content:'block+'},text:{group:'inline'},paragraph:{group:'block',content:'inline*'},previewAttachment:{group:'block',atom:true,attrs:{kind:{default:'image'},gap:{default:900}}},blockquote:{group:'block',content:'block+'},table:{group:'block',content:'paragraph+',isolating:true},codeBlock:{group:'block',content:'text*',code:true}}})
const p=text=>schema.nodes.paragraph.create(null,text?schema.text(text):null)
const media=kind=>schema.nodes.previewAttachment.create({kind})
for(const [kind,object] of [['image',media('image')],['video',media('video')],['drawing',media('drawing')],['table',schema.nodes.table.create(null,p('Cell'))],['code',schema.nodes.codeBlock.create(null,schema.text('const x = 1'))]])for(const direction of [-1,1])test(`${direction<0?'Backspace':'Delete'} skips a floating ${kind} and joins only text, with undo`,()=>{
  const doc=schema.nodes.doc.create(null,[p('Before'),object,p('After')])
  const caret=direction<0?p('Before').nodeSize+object.nodeSize+1:7
  let state=EditorState.create({schema,doc,selection:TextSelection.create(doc,caret),plugins:[history()]})
  const dispatch=tr=>{state=state.apply(tr)}
  assert.equal(deleteAcrossObjects(state,dispatch,direction),true)
  assert.equal(state.doc.childCount,2)
  assert.equal(state.doc.firstChild.textContent,'BeforeAfter')
  assert.ok(state.doc.child(1).eq(object))
  assert.equal(state.selection.from,7)
  undo(state,dispatch);assert.ok(state.doc.eq(doc))
  redo(state,dispatch);assert.equal(state.doc.firstChild.textContent,'BeforeAfter')
})
test('empty paragraphs and consecutive objects cannot consume adjacent media',()=>{
  const objects=[media('video'),media('image'),schema.nodes.table.create(null,p('Keep'))]
  const doc=schema.nodes.doc.create(null,[p('First'),...objects,p()])
  let state=EditorState.create({schema,doc,selection:TextSelection.create(doc,doc.content.size-1)})
  assert.equal(deleteAcrossObjects(state,tr=>{state=state.apply(tr)},-1),true)
  assert.equal(state.doc.childCount,4)
  objects.forEach((object,i)=>assert.ok(state.doc.child(i+1).eq(object)))
  state=state.apply(state.tr.setSelection(TextSelection.create(state.doc,6)))
  assert.equal(deleteAcrossObjects(state,()=>assert.fail('no text beyond objects'),1),true)
})
test('ordinary text, explicit object/range selections, and table-cell editing keep normal deletion',()=>{
  const doc=schema.nodes.doc.create(null,[p('First'),media('video'),p('Last'),schema.nodes.table.create(null,p('Cell'))])
  for(const selection of [TextSelection.create(doc,3),TextSelection.create(doc,1,3),NodeSelection.create(doc,7),TextSelection.create(doc,16)]) {
    const state=EditorState.create({schema,doc,selection})
    assert.equal(deleteAcrossObjects(state,()=>assert.fail('not intercepted'),-1),false)
  }
})

test('nested text boundaries never implicitly select an outside object',()=>{
  const quote=schema.nodes.blockquote.create(null,p())
  for(const [content,pos,direction] of [[[media('video'),quote],3,-1],[[quote,media('image')],2,1]]){
    const doc=schema.nodes.doc.create(null,content),state=EditorState.create({schema,doc,selection:TextSelection.create(doc,pos)})
    assert.equal(deleteAcrossObjects(state,()=>assert.fail('object must remain unselected'),direction),true)
  }
})
