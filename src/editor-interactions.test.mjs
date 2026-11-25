import test from 'node:test'
import assert from 'node:assert/strict'
import { Schema } from '@tiptap/pm/model'
import { EditorState, NodeSelection } from '@tiptap/pm/state'
import { history, undo, redo, closeHistory } from '@tiptap/pm/history'
import { place } from './placement.js'
import { canvasTransaction } from './canvas-flow.js'
import { drawingBox } from './canvas-layout.js'
import { hitsStroke } from '../format/drawing.mjs'
import { createObjectResizer, imageResizeWidth, visualSize } from './object-resize.js'
import { copyEditorSelection, pasteEditorSelection } from './editor-clipboard.js'

const schema = new Schema({nodes: {
  doc: {content:'block+'}, text: {group:'inline'}, paragraph: {group:'block',content:'inline*'},
  image: {group:'block',atom:true,attrs:{id:{default:null},layout:{default:null},documentFlow:{default:false},offset:{default:0},gap:{default:0},clear:{default:false},canvasWidth:{default:0},layer:{default:0},width:{default:null}}},
}})
const paragraph = text => schema.nodes.paragraph.create(null,text?schema.text(text):null)
const picture = id => schema.nodes.image.create({id})

test('moving an object preserves content and is a separate reversible undo step', () => {
  const doc=schema.nodes.doc.create(null,[picture('a'),paragraph('Hello'),picture('b'),paragraph('End')])
  let state=EditorState.create({schema,doc,plugins:[history()]})
  const view={get state(){return state},dom:{clientWidth:800},dispatch(tr){state=state.apply(tr)},focus(){},posAtDOM(el){return el.pos}}
  view.dispatch(state.tr.insertText('!',7))
  const edited=state.doc
  const target={pos:9}
  assert.equal(place({view,getPos:()=>0,placement:{layout:'left',offset:10,gap:30,clear:false},slot:{before:target,others:[{element:target,placement:{layout:'right',offset:5,gap:0,clear:false}}]},rebuild:(node,attrs)=>node.type.create({...node.attrs,...attrs})}),true)
  assert.ok(state.selection instanceof NodeSelection)
  assert.equal(state.selection.node.attrs.id,'a')
  assert.equal(state.doc.textContent,'Hello!End')
  const moved=state.doc
  undo(state,tr=>view.dispatch(tr))
  assert.ok(state.doc.eq(edited),'one undo restores both object positions, retaining the prior edit')
  redo(state,tr=>view.dispatch(tr))
  assert.ok(state.doc.eq(moved))
})

test('image resize follows vertical as well as horizontal movement and respects limits', () => {
  assert.equal(imageResizeWidth(200,100,0,50,800),300)
  assert.equal(imageResizeWidth(200,100,-80,-10,800),120)
  assert.equal(imageResizeWidth(200,100,1000,0,500),500)
  assert.equal(imageResizeWidth(200,100,-1000,0,800),40)
  assert.equal(imageResizeWidth(200,100,-1000,0,30),30)
})

test('an edge resizes one dimension and the corner follows the resulting frame', () => {
  const rect = {width:240, height:120}
  const tall = visualSize(rect,'height',100,60,320)
  assert.deepEqual(tall,{width:240,height:180})
  assert.deepEqual(visualSize(tall,'width',200,-90,320),{width:320,height:180})
  assert.deepEqual(visualSize(tall,'corner',40,0,320),{width:280,height:210})
  const thin = {width:4,height:400}
  assert.deepEqual(visualSize(thin,'height',90,-100,320,4,4),{width:4,height:300})
  assert.deepEqual(visualSize(thin,'corner',1,0,320,4,4),thin)
})

test('a stretched drawing can be hit at its displayed position on a narrow page', () => {
  const drawing = {width:100,height:50,points:[[0,0],[100,50]],size:2}
  const box = drawingBox({drawing,drawingPageWidth:800,canvasWidth:200,frameRatio:1,gap:40},400)
  assert.deepEqual(box,{x:0,y:20,width:100,height:100})
  assert.equal(hitsStroke(drawing,80,80,4,box.width/drawing.width,box.height/drawing.height),true)
  assert.equal(hitsStroke(drawing,80,40,4,box.width/drawing.width,box.height/drawing.height),false)
})

test('canvas migration, movement and resize commit as one undo step without rewriting stationary objects',()=>{
  const doc=schema.nodes.doc.create(null,[picture('a'),paragraph('Wrapped text'),picture('b')])
  let state=EditorState.create({schema,doc,plugins:[history()]})
  const items=[]
  doc.forEach((node,pos)=>{if(node.type.name==='image')items.push({node,pos,image:true,box:{x:pos?350:0,y:100,width:180,height:80},layer:0})})
  const dispatch=tr=>{state=state.apply(tr)}
  dispatch(canvasTransaction(state,items,800,0));dispatch(closeHistory(state.tr))
  const migrated=state.doc
  for(const item of items)item.node=state.doc.nodeAt(item.pos)
  items[0].box={x:85,y:221,width:240,height:105}
  items[0].layer=1
  const move=canvasTransaction(state,items,800,0)
  assert.equal(move.steps.length,1,'only the changed object is written on subsequent gestures')
  dispatch(move);dispatch(closeHistory(state.tr))
  const moved=state.doc
  assert.equal(moved.textContent,'Wrapped text')
  assert.equal(moved.nodeAt(0).attrs.offset,10.63)
  assert.equal(moved.nodeAt(0).attrs.gap,221)
  assert.equal(moved.nodeAt(0).attrs.width,240)
  assert.ok(state.selection instanceof NodeSelection)
  undo(state,dispatch)
  assert.ok(state.doc.eq(migrated))
  undo(state,dispatch)
  assert.ok(state.doc.eq(doc),'the complete legacy layout survives undo')
  redo(state,dispatch);redo(state,dispatch)
  assert.ok(state.doc.eq(moved))
  assert.ok(schema.nodeFromJSON(state.doc.toJSON()).eq(moved),'positions and sizes survive JSON persistence')
})

test('dragging an imported object promotes only that object to canvas and undo restores document flow',()=>{
  const imported=schema.nodes.image.create({id:'imported',documentFlow:true})
  const doc=schema.nodes.doc.create(null,[paragraph('Before'),imported,paragraph('After')])
  const pos=8
  let state=EditorState.create({schema,doc,plugins:[history()]})
  const dispatch=tr=>{state=state.apply(tr)}
  dispatch(canvasTransaction(state,[{node:imported,pos,image:true,box:{x:120,y:180,width:240,height:120},layer:1}],800,pos));dispatch(closeHistory(state.tr))
  assert.equal(state.doc.nodeAt(pos).attrs.documentFlow,false)
  assert.equal(state.doc.nodeAt(pos).attrs.layout,'canvas')
  assert.equal(state.doc.textContent,'BeforeAfter')
  undo(state,dispatch);assert.ok(state.doc.eq(doc))
  redo(state,dispatch);assert.equal(state.doc.nodeAt(pos).attrs.documentFlow,false)
})

test('menu copy includes rich HTML and the text alternative from the editor serializer', async () => {
  const original=globalThis.ClipboardItem
  globalThis.ClipboardItem=class {constructor(data){this.data=data}}
  try {
    let result
    const view={state:{selection:{content:()=>({})}},serializeForClipboard:()=>({dom:{innerHTML:'<div data-file="picture" data-width="180" data-pm-slice="0 0 []"></div>'},text:'Picture'})}
    await copyEditorSelection(view,{write:async items=>{result=items[0].data}})
    assert.match(await result['text/html'].text(),/data-file="picture"/)
    assert.equal(await result['text/plain'].text(),'Picture')
  } finally {globalThis.ClipboardItem=original}
})

const clipboard = html => ({read:async()=>[{types:['text/html','text/plain'],getType:async type=>new Blob([type==='text/html'?html:'plain alternative'])}]})
test('menu paste prefers rich content, keeping table and formatting markup', async () => {
  let pasted
  const selection={eq:other=>other===selection}
  const view={state:{doc:{},selection},focus(){},pasteHTML(html){pasted=html;return true},pasteText(){assert.fail('discarded rich content')}}
  assert.equal(await pasteEditorSelection(view,()=>true,clipboard('<table><tr><td><strong>Value</strong></td></tr></table>')),true)
  assert.match(pasted,/<table>/)
  assert.match(pasted,/<strong>Value<\/strong>/)
})
test('clipboard permission delays cannot paste into a changed document or selection', async () => {
  const selection={eq:other=>other===selection}
  const view={state:{doc:{},selection},focus(){assert.fail('stale view focused')},pasteHTML(){assert.fail('stale paste')}}
  const delayed={read:async()=>{view.state={...view.state,doc:{}};return (await clipboard('<p>old</p>').read())}}
  assert.equal(await pasteEditorSelection(view,()=>true,delayed),false)
})

test('Escape, pointer cancellation and lost capture restore resize previews without saving', () => {
  const original={document:globalThis.document,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame}
  try {
    for (const cancellation of ['Escape','pointercancel','lostpointercapture','destroy']) {
      globalThis.document=new EventTarget()
      let pending, saved=0, captured=false, style='width: 200px'
      globalThis.requestAnimationFrame=callback=>{pending=callback;return 1}
      globalThis.cancelAnimationFrame=()=>{pending=null}
      const classes=new Set(),handle=new EventTarget()
      Object.assign(handle,{dataset:{resizeAxis:'width'},setPointerCapture(){captured=true},hasPointerCapture(){return captured},releasePointerCapture(){captured=false}})
      const dom={querySelectorAll:()=>[],getAttribute:()=>style,setAttribute:(_,value)=>{style=value},removeAttribute:()=>{style=null},
        classList:{contains:name=>classes.has(name),add:name=>classes.add(name),remove:name=>classes.delete(name),toggle:(name,on)=>on?classes.add(name):classes.delete(name)}}
      const view={state:{doc:{}},dom:{children:[]},dispatch(){saved++}}
      const gesture=createObjectResizer({view,dom,handles:[handle],isEditable:()=>true,begin:()=>({}),preview:()=>{style='width: 300px'},commit:()=>{saved++}})
      const send=(target,type,properties)=>{const event=new Event(type,{cancelable:true});Object.assign(event,properties);target.dispatchEvent(event)}
      send(handle,'pointerdown',{pointerId:1,button:0,clientX:200,clientY:100})
      send(handle,'pointermove',{pointerId:1,clientX:300,clientY:100})
      pending()
      assert.equal(style,'width: 300px')
      if(cancellation==='Escape')send(document,'keydown',{key:'Escape'})
      else if(cancellation==='destroy')gesture.destroy()
      else send(handle,cancellation,{pointerId:1})
      assert.equal(style,'width: 200px',cancellation)
      assert.equal(saved,0,cancellation)
      assert.equal(captured,false,cancellation)
      assert.equal(classes.has('is-resizing'),false,cancellation)
      gesture.destroy()
    }
  } finally {Object.assign(globalThis,original)}
})
