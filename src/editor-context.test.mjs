import test from 'node:test'
import assert from 'node:assert/strict'
import { Schema } from '@tiptap/pm/model'
import { EditorState, AllSelection, NodeSelection, TextSelection } from '@tiptap/pm/state'
import { editorContext } from './editor-controls.js'

const schema=new Schema({nodes:{doc:{content:'block+'},paragraph:{group:'block',content:'text*'},codeBlock:{group:'block',content:'text*',code:true,marks:''},previewAttachment:{group:'block',atom:true},text:{}}})
const p=text=>schema.nodes.paragraph.create(null,schema.text(text))
const doc=schema.nodes.doc.create(null,[p('Before'),schema.nodes.previewAttachment.create(),p('After'),schema.nodes.codeBlock.create(null,schema.text('return answer'))])
const object={closest:selector=>selector==='.fn-attachment'?object:null,classList:{contains:()=>false}}
function fixture(selection){
  let state=EditorState.create({doc,selection})
  const editor={isEditable:true,get state(){return state},commands:{setNodeSelection:pos=>{state=state.apply(state.tr.setSelection(NodeSelection.create(doc,pos)))},setTextSelection:pos=>{state=state.apply(state.tr.setSelection(TextSelection.create(doc,pos)))}},
    view:{posAtDOM:()=>8,posAtCoords:()=>({pos:1}),nodeDOM:()=>object},isActive:name=>state.selection.$from.parent.type.name===name}
  const options={getEditor:()=>editor,onLink(){},toast(){},schedule(){}}
  return {editor,options}
}
test('image context selects the clicked atom even inside an existing Select All',()=>{
  for(const selection of [new AllSelection(doc),TextSelection.create(doc,1,6),NodeSelection.create(doc,8)]){
    const {editor,options}=fixture(selection)
    const actions=editorContext(object,{x:100,y:100,source:'mouse'},options)
    assert.ok(editor.state.selection instanceof NodeSelection)
    assert.equal(editor.state.selection.from,8)
    assert.deepEqual(actions.map(a=>a.label),['Duplicate','Copy','Cut','Paste'])
    assert.equal(actions[1].disabled,false)
    assert.equal(editor.state.doc,doc,'opening an object menu never edits the document')
  }
})
test('keyboard context keeps the selected image and code context omits text formatting',()=>{
  const target={closest:()=>null}
  const {editor,options}=fixture(NodeSelection.create(doc,8))
  assert.deepEqual(editorContext(target,{source:'keyboard'},options).map(a=>a.label),['Duplicate','Copy','Cut','Paste'])
  editor.commands.setTextSelection(18)
  assert.equal(editor.isActive('codeBlock'),true)
  assert.deepEqual(editorContext(target,{source:'keyboard'},options).map(a=>a.label),['Copy','Cut','Paste','Select all'])
})
test('ordinary text retains its formatting context actions',()=>{
  const {options}=fixture(TextSelection.create(doc,1,4))
  const actions=editorContext({closest:()=>null},{source:'keyboard'},options)
  assert.ok(actions.some(a=>a.label==='Bold'))
  assert.ok(actions.some(a=>a.label==='Add or edit link…'))
})
test('placed objects offer only the stacking moves that change what is seen, with their shortcuts',()=>{
  const placed=new Schema({nodes:{doc:{content:'block+'},paragraph:{group:'block',content:'text*'},previewAttachment:{group:'block',atom:true,attrs:{layout:{default:'canvas'},layer:{default:0}}},text:{}}})
  const lower=placed.nodes.previewAttachment.create({layer:1}),upper=placed.nodes.previewAttachment.create({layer:2}),apart=placed.nodes.previewAttachment.create({layer:3})
  const placedDoc=placed.nodes.doc.create(null,[lower,upper,apart,placed.nodes.paragraph.create()])
  const rects={0:{left:0,top:0,right:100,bottom:100},1:{left:50,top:50,right:150,bottom:150},2:{left:400,top:400,right:500,bottom:500}}
  const menuFor=pos=>{
    let state=EditorState.create({doc:placedDoc})
    const editor={isEditable:true,get state(){return state},commands:{setNodeSelection:at=>{state=state.apply(state.tr.setSelection(NodeSelection.create(placedDoc,at)))}},
      view:{get state(){return state},editable:true,posAtDOM:()=>pos,nodeDOM:at=>({getBoundingClientRect:()=>rects[at]})},isActive:()=>false}
    return editorContext(object,{x:0,y:0,source:'mouse'},{getEditor:()=>editor,onLink(){},toast(){},schedule(){}})
  }
  const labels=pos=>menuFor(pos).filter(a=>!a.separator).map(a=>a.label)
  assert.deepEqual(labels(0).slice(0,2),['Bring to front','Bring forward'])
  assert.ok(!labels(0).includes('Send backward'))
  assert.deepEqual(labels(1).slice(0,2),['Send backward','Send to back'])
  assert.ok(!labels(2).some(label=>/^(Bring|Send)/.test(label)),'an object overlapping nothing has no stacking choices')
  assert.ok(menuFor(0).find(a=>a.label==='Bring forward').hint.endsWith(']'))
})
