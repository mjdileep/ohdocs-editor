import test from 'node:test'
import assert from 'node:assert/strict'
import { Schema } from '@tiptap/pm/model'
import { EditorState, NodeSelection } from '@tiptap/pm/state'
import { history, undo, redo, closeHistory } from '@tiptap/pm/history'
import { promotePastedCanvas } from './canvas-nesting.js'
import { CanvasFlow, canvasTransaction } from './canvas-flow.js'
import { objects } from './canvas-layout.js'

const schema=new Schema({nodes:{doc:{content:'block+'},paragraph:{group:'block',content:'text*'},text:{},
  bulletList:{group:'block',content:'listItem+'},listItem:{content:'paragraph block*'},blockquote:{group:'block',content:'block+'},
  table:{group:'block',content:'tableRow+'},tableRow:{content:'tableCell+'},tableCell:{content:'block+'},
  previewAttachment:{group:'block',atom:true,attrs:{id:{default:null},drawing:{default:null},layout:{default:null},documentFlow:{default:false},offset:{default:0},gap:{default:0},canvasWidth:{default:20},layer:{default:0},clear:{default:false},width:{default:20}}}
}})
const n=(name,content,attrs)=>schema.nodes[name].create(attrs,content)
const p=value=>n('paragraph',value?schema.text(value):null)
const stroke=(id,attrs={})=>n('previewAttachment',null,{id,drawing:{points:[[5,5],[5,600]],width:20,height:610,size:3,color:'#15805e'},...attrs})
const list=contents=>n('bulletList',n('listItem',contents))
const nested=(document,id)=>{let found;document.descendants((node,pos)=>{if(node.attrs.id===id)found={node,pos}});return found}

test('an existing pasted stroke can leave a list, keeping text, selection, dimensions and undo',()=>{
  const original=n('doc',[stroke('original',{layout:'canvas',offset:2}),list([p('Before'),stroke('copy',{layout:'right'}),p('After')]),p('End')])
  let state=EditorState.create({doc:original,plugins:[history()]})
  const dispatch=tr=>{state=state.apply(tr)},item=nested(state.doc,'copy')
  dispatch(canvasTransaction(state,[{...item,nested:true,image:true,box:{x:240,y:130,width:20,height:610},layer:4}],800,item.pos))
  dispatch(closeHistory(state.tr))
  const moved=state.doc,copy=nested(moved,'copy')
  assert.equal(moved.resolve(copy.pos).depth,0)
  assert.equal(copy.node.attrs.offset,30);assert.equal(copy.node.attrs.gap,130)
  assert.equal(copy.node.attrs.width,20);assert.deepEqual(copy.node.attrs.drawing,item.node.attrs.drawing)
  assert.equal(moved.textContent,'BeforeAfterEnd')
  assert.ok(moved.firstChild.eq(original.firstChild),'other drawing is unchanged')
  assert.ok(state.selection instanceof NodeSelection);assert.equal(state.selection.node.attrs.id,'copy')
  undo(state,dispatch);assert.ok(state.doc.eq(original))
  redo(state,dispatch);assert.ok(state.doc.eq(moved))
  assert.ok(schema.nodeFromJSON(moved.toJSON()).eq(moved))
})

test('resizing a nested object applies the size at its original position before promotion',()=>{
  const original=n('doc',list([p('Keep this'),stroke('copy')]))
  const state=EditorState.create({doc:original}),item=nested(original,'copy')
  const tr=canvasTransaction(state,[{...item,image:true,box:{x:80,y:40,width:30,height:915},layer:1}],800,item.pos,transaction=>{
    transaction.setNodeMarkup(item.pos,null,{...transaction.doc.nodeAt(item.pos).attrs,width:30,canvasWidth:30})
  })
  assert.equal(tr.selection.node.attrs.id,'copy');assert.equal(tr.selection.node.attrs.width,30)
  assert.equal(tr.doc.resolve(tr.selection.from).depth,0)
  assert.equal(tr.doc.textContent,'Keep this')
})

test('pasted canvas copies leave lists and quotes in order, while document-flow content stays nested',()=>{
  const a=stroke('a',{layout:'canvas',offset:11,gap:40}),b=stroke('b',{layout:'canvas',offset:14,gap:64})
  const flow=stroke('flow',{documentFlow:true,layout:'canvas'})
  const original=n('doc',[list([p('One'),a,b,p('Two')]),n('blockquote',[p('Quoted'),stroke('c',{layout:'canvas'}),flow])])
  const tr=promotePastedCanvas(EditorState.create({doc:original}).tr)
  assert.deepEqual(tr.doc.content.content.filter(node=>node.type.name==='previewAttachment').map(node=>node.attrs.id),['a','b','c'])
  for(const id of ['a','b','c'])assert.equal(tr.doc.resolve(nested(tr.doc,id).pos).depth,0)
  assert.ok(nested(tr.doc,'a').node.eq(a));assert.ok(nested(tr.doc,'b').node.eq(b))
  assert.ok(tr.doc.resolve(nested(tr.doc,'flow').pos).depth>0)
  assert.equal(tr.doc.textContent,'OneTwoQuoted')
})

test('native paste and drop promote inserted canvas objects in the same undo step',()=>{
  for(const action of ['paste','drop']){
    const before=p('Before'),original=n('doc',list([before,p('After')]))
    let state=EditorState.create({doc:original,plugins:[history(),...CanvasFlow.config.addProseMirrorPlugins()]})
    const dispatch=tr=>{state=state.applyTransaction(tr).state}
    const tr=state.tr.insert(2+before.nodeSize,stroke('incoming',{layout:'canvas'})).setMeta('uiEvent',action)
    if(action==='paste')tr.setMeta('paste',true)
    dispatch(tr)
    const copy=nested(state.doc,'incoming')
    assert.equal(state.doc.resolve(copy.pos).depth,0,action)
    assert.equal(state.doc.textContent,'BeforeAfter')
    undo(state,dispatch);assert.ok(state.doc.eq(original),action+' remains a single undo step')
    redo(state,dispatch);assert.equal(state.doc.resolve(nested(state.doc,'incoming').pos).depth,0)
  }
})

test('moving the only object in a table cell preserves a valid empty cell; copying a table retains its contents',()=>{
  const table=n('table',n('tableRow',n('tableCell',stroke('cell')))),original=n('doc',[table,p('After')])
  const state=EditorState.create({doc:original}),item=nested(original,'cell')
  const moved=canvasTransaction(state,[{...item,image:true,box:{x:40,y:20,width:20,height:610},layer:2}],800,item.pos).doc
  moved.check()
  assert.equal(moved.firstChild.firstChild.firstChild.firstChild.type.name,'paragraph')
  assert.equal(moved.textContent,'After')
  assert.equal(promotePastedCanvas(state.tr).docChanged,false,'a table paste does not pull its own cell contents apart')
})

test('a gesture can find a nested object without treating every nested block as a page object',t=>{
  const old=globalThis.HTMLElement
  class Element{constructor(x){this.classList={contains:name=>name==='fn-image'};this.x=x}getBoundingClientRect(){return {left:this.x,top:50,width:20,height:610}}}
  globalThis.HTMLElement=Element;t.after(()=>{globalThis.HTMLElement=old})
  const document=n('doc',[stroke('original',{layout:'canvas'}),list([p('Text'),stroke('copy',{layout:'right'})])])
  const copy=nested(document,'copy'),rootDOM=new Element(100),copyDOM=new Element(700)
  const view={state:{doc:document},dom:{getBoundingClientRect:()=>({left:80,top:20})},nodeDOM:pos=>pos===copy.pos?copyDOM:rootDOM}
  assert.equal(objects(view).length,1)
  const items=objects(view,copy.pos)
  assert.equal(items.length,2);assert.equal(items[1].nested,true)
  assert.deepEqual(items[1].box,{x:620,y:30,width:20,height:610})
})
