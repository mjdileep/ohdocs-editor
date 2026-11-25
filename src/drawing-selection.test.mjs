import test from 'node:test'
import assert from 'node:assert/strict'
import { Schema } from '@tiptap/pm/model'
import { EditorState, AllSelection, TextSelection, NodeSelection } from '@tiptap/pm/state'
import { history, undo } from '@tiptap/pm/history'
import { drawingSelectionGuard, selectionTouches } from './drawing-selection.js'
import { insertShortcuts, insertShortcutLabel, insertShortcut, drawingShortcut } from './editor-shortcuts.js'

const schema=new Schema({nodes:{doc:{content:'paragraph+'},paragraph:{content:'text*'},text:{}}})
function fixture(selected=false){
  const original=schema.nodes.doc.create(null,schema.nodes.paragraph.create(null,schema.text('Keep these words')))
  let state=EditorState.create({doc:original,plugins:[history()]})
  state=state.apply(state.tr.insertText('!',state.doc.content.size-1))
  if(selected)state=state.apply(state.tr.setSelection(new AllSelection(state.doc)).setMeta('addToHistory',false))
  const saved=state.doc,view={get state(){return state},dispatch(tr){state=state.apply(tr)}}
  const paper=new EventTarget(),classes=new Set()
  paper.classList={add:name=>classes.add(name),remove:name=>classes.delete(name)}
  paper.contains=node=>node?.inPaper===true
  const selection={rangeCount:1,isCollapsed:false,anchorNode:{inPaper:true},focusNode:{inPaper:true},intersects:true,
    getRangeAt(){return {intersectsNode:()=>this.intersects}},removeAllRanges(){this.rangeCount=0;this.isCollapsed=true;this.removed=(this.removed||0)+1}}
  const doc=new EventTarget();doc.getSelection=()=>selection
  return {view,paper,doc,selection,classes,saved,original}
}

test('drawing clears browser and editor Select All without changing content or undo history',()=>{
  const {view,paper,doc,selection,saved,original}=fixture(true)
  const guard=drawingSelectionGuard(view,paper,doc)
  assert.equal(view.state.selection.empty,true)
  assert.ok(view.state.selection instanceof TextSelection)
  assert.ok(view.state.doc.eq(saved))
  assert.equal(selection.rangeCount,0)
  assert.equal(guard.clear(),false,'an ordinary drawing click should not be consumed')
  undo(view.state,tr=>view.dispatch(tr));assert.ok(view.state.doc.eq(original))
  guard.destroy()
})

test('entering drawing mode from consecutive selected objects does not consume subsequent strokes',()=>{
  const atoms=new Schema({nodes:{doc:{content:'block+'},paragraph:{group:'block',content:'text*'},object:{group:'block',atom:true},text:{}}})
  for(const content of [
    [atoms.nodes.object.create(),atoms.nodes.object.create(),atoms.nodes.paragraph.create(null,atoms.text('After'))],
    [atoms.nodes.object.create(),atoms.nodes.object.create()]
  ]){
    const original=atoms.nodes.doc.create(null,content)
    let state=EditorState.create({doc:original,selection:NodeSelection.create(original,0)})
    const view={get state(){return state},dispatch:tr=>{state=state.apply(tr)}}
    const {paper,doc}=fixture()
    const guard=drawingSelectionGuard(view,paper,doc)
    assert.equal(guard.clear(),false,'the next drawing press should start a stroke')
    assert.ok(state.doc.eq(original))
    if(content.length===3)assert.ok(state.selection instanceof TextSelection)
    guard.destroy()
  }
})

test('selection crossing the whole paper from outside is cleared; unrelated selections remain usable',()=>{
  const {view,paper,doc,selection}=fixture()
  selection.anchorNode={};selection.focusNode={};selection.intersects=false
  const guard=drawingSelectionGuard(view,paper,doc)
  assert.equal(selection.removed,undefined)
  doc.dispatchEvent(new Event('selectionchange'))
  assert.equal(selection.removed,undefined)
  selection.intersects=true
  assert.equal(selectionTouches(selection,paper),true)
  doc.dispatchEvent(new Event('selectionchange'))
  assert.equal(selection.rangeCount,0)
  doc.dispatchEvent(new Event('selectionchange'))
  assert.equal(selection.removed,1,'clearing does not create a selection-change loop')
  guard.destroy()
})

test('drawing prevents margin/title drags, and closing restores normal selection listeners',()=>{
  const {view,paper,doc,selection,classes,saved}=fixture();let focused=0
  const guard=drawingSelectionGuard(view,paper,doc,()=>focused++)
  assert.equal(classes.has('fn-drawing-active'),true)
  for(const name of ['selectstart','dragstart','pointerdown','click']){
    const event=new Event(name,{cancelable:true});paper.dispatchEvent(event);assert.equal(event.defaultPrevented,true,name)
  }
  assert.equal(focused,2);assert.ok(view.state.doc.eq(saved))
  guard.destroy();assert.equal(classes.has('fn-drawing-active'),false)
  for(const name of ['selectstart','dragstart','pointerdown','click']){
    const event=new Event(name,{cancelable:true});paper.dispatchEvent(event);assert.equal(event.defaultPrevented,false,name)
  }
  selection.rangeCount=1;selection.isCollapsed=false
  doc.dispatchEvent(new Event('selectionchange'));assert.equal(selection.rangeCount,1)
})

const keyEvent=(key,extra={})=>({key,code:key==='-'?'Minus':'Key'+key.toUpperCase(),ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,...extra})
test('insert hints match every Mac and Windows binding, including Option-generated symbols',()=>{
  for(const [command,binding] of Object.entries(insertShortcuts))for(const mac of [true,false]){
    const event=keyEvent(binding.key,{altKey:true,metaKey:mac,ctrlKey:!mac,shiftKey:!!binding.shift})
    assert.equal(insertShortcut(event,mac),command)
    assert.ok(insertShortcutLabel(command,mac).endsWith(binding.key.toUpperCase()))
    assert.equal(insertShortcut({...event,repeat:true},mac),null)
    assert.equal(insertShortcut({...event,isComposing:true},mac),null)
    assert.equal(insertShortcut({...event,getModifierState:name=>name==='AltGraph'},mac),null)
  }
  assert.equal(insertShortcut(keyEvent('π',{code:'KeyP',metaKey:true,altKey:true}),true),'drawing')
  assert.equal(insertShortcut(keyEvent('–',{code:'Minus',metaKey:true,altKey:true}),true),'divider')
  assert.equal(insertShortcut(keyEvent('p',{metaKey:true}),true),null,'printing is not intercepted')
  assert.equal(insertShortcut(keyEvent('p'),true),null,'ordinary typing is not an insert action')
})

test('drawing tool keys and history have separate unmodified/platform bindings',()=>{
  for(const [key,action] of [['p','pen'],['h','highlighter'],['l','line'],['a','arrow'],['r','rectangle'],['o','ellipse'],['d','diamond'],['e','eraser'],['1','ink-1'],['6','ink-6'],['[','thinner'],[']','thicker'],['Escape','done']]){
    assert.equal(drawingShortcut(keyEvent(key),true),action)
    assert.equal(drawingShortcut(keyEvent(key,{isComposing:true}),true),null)
    assert.equal(drawingShortcut(keyEvent(key,{altKey:true}),true),null)
  }
  assert.equal(drawingShortcut(keyEvent('z',{metaKey:true}),true),'undo')
  assert.equal(drawingShortcut(keyEvent('Z',{metaKey:true,shiftKey:true}),true),'redo')
  assert.equal(drawingShortcut(keyEvent('y',{ctrlKey:true}),false),'redo')
  assert.equal(drawingShortcut(keyEvent('a',{ctrlKey:true}),false),'clear-selection')
  assert.equal(drawingShortcut(keyEvent('p',{metaKey:true}),true),null)
  assert.equal(drawingShortcut(keyEvent('q'),true),null)
})
