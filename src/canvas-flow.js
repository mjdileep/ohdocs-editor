import { Extension } from '@tiptap/core'
import { Plugin, NodeSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { closeHistory, isHistoryTransaction } from '@tiptap/pm/history'
import { Mapping } from '@tiptap/pm/transform'
import { quietly } from './editor-dom.js'
import { canvasPosition } from './wrap-bands.js'
import { CanvasLayout, clamp, rounded, objects, paintObject, exclusions, drawBands } from './canvas-layout.js'
import { createDragAlignment } from './alignment-guides.js'
import { promoteCanvasObject, promotePastedCanvas } from './canvas-nesting.js'

const controllers = new WeakMap()
const isObject = node => node.type.name === 'previewAttachment' || node.type.name === 'table' || node.type.name === 'codeBlock'
class CanvasController extends CanvasLayout {
  begin(pos) {
    if(this.session||this.view.dom.clientWidth<=560)return null
    const view=this.view,items=objects(view,pos),target=items.find(item=>item.pos===pos)
    if(!target)return null
    const page=view.dom.getBoundingClientRect(),doc=view.state.doc
    const originals=items.map(item=>({dom:item.dom,style:item.dom.getAttribute('style'),canvas:item.dom.classList.contains('fn-canvas-object')}))
    const session={items,target,page,doc,done:false,
      draw:()=>drawBands(view,exclusions(items,page.width),page.width),
      restore:()=>{
        if(session.done)return
        session.done=true;this.session=null
        quietly(view,()=>{for(const old of originals){
          if(!old.dom.isConnected)continue
          old.style===null?old.dom.removeAttribute('style'):old.dom.setAttribute('style',old.style)
          old.dom.classList.toggle('fn-canvas-object',old.canvas)
        }})
        this.refresh()
      },
      commit:(edit)=>{
        if(session.done)return false
        const valid=view.state.doc===doc&&!view.isDestroyed
        session.restore()
        if(!valid)return false
        const tr=canvasTransaction(view.state,items,page.width,pos,edit)
        view.dispatch(tr)
        view.dispatch(closeHistory(view.state.tr))
        view.focus();this.refresh()
        return true
      },
    }
    this.session=session
    // An existing nested copy keeps its current DOM anchor during the preview.
    // The pointer transform works there too; commit moves it onto the page.
    quietly(view,()=>{for(const item of items)if(!item.nested)paintObject(item.dom,item.box,item.layer)})
    session.draw()
    return session
  }
  destroy(){super.destroy();controllers.delete(this.view)}
}

export const CanvasFlow=Extension.create({
  name:'canvasFlow',
  addProseMirrorPlugins(){let canvasView;return [new Plugin({
    appendTransaction(transactions,oldState,state){
      if(!transactions.some(tr=>tr.docChanged)||transactions.some(tr=>isHistoryTransaction(tr)||tr.getMeta('canvasFlow')))return null
      if(transactions.some(tr=>tr.getMeta('paste')||tr.getMeta('uiEvent')==='drop')){
        const promoted=promotePastedCanvas(state.tr)
        if(promoted.docChanged)return promoted.setMeta('canvasFlow',true)
      }
      // Loading a whole note preserves its stored layout. Only local edits and
      // insertions acquire coordinates from the current rendered note.
      if(transactions.some(tr=>tr.steps.some(step=>step.from===0&&step.to===oldState.doc.content.size)))return null
      const view=canvasView,controller=view&&controllers.get(view)
      if(!controller||controller.session||view.dom.clientWidth<=560||view.state.doc!==oldState.doc)return null
      const mapping=new Mapping()
      for(const tr of transactions)mapping.appendMapping(tr.mapping)
      const prior=new Map()
      for(const item of objects(view)){
        const mapped=mapping.mapResult(item.pos,1)
        if(!mapped.deleted)prior.set(mapped.pos,item)
      }
      const tr=state.tr,pageWidth=view.dom.clientWidth
      let inserted=0
      state.doc.forEach((node,pos)=>{
        if(!isObject(node)||node.attrs.layout==='canvas'||node.attrs.documentFlow)return
        const old=prior.get(pos)
        if(old&&old.node.type===node.type){
          tr.setNodeMarkup(pos,null,{...node.attrs,...canvasAttributes(old,pageWidth)})
        }else{
          const columns=[]
          if(node.type.name==='table')node.firstChild?.forEach(cell=>columns.push(...(cell.attrs.colwidth||[])))
          const width=node.attrs.width||node.attrs.canvasWidth||(columns.length?columns.reduce((sum,width)=>sum+width,0)+2:320)
          const placement=canvasPastePlacement(view,width,inserted++)
          if(placement)tr.setNodeMarkup(pos,null,{...node.attrs,...placement})
        }
      })
      return tr.docChanged?tr.setMeta('canvasFlow',true):null
    },
    props:{
      // Undo/redo selects an object in document order. Its visual position is
      // independent, so ProseMirror's ordinary block scrolling would jump.
      handleScrollToSelection(view){return view.dom.clientWidth>560&&view.state.selection instanceof NodeSelection&&isObject(view.state.selection.node)},
      decorations(state){
        let count=0;state.doc.forEach(node=>{if(isObject(node))count++})
        return DecorationSet.create(state.doc,Array.from({length:count*4+2},(_,index)=>Decoration.widget(0,()=>{
          const float=document.createElement('div');float.className='fn-wrap-band';float.contentEditable='false';float.setAttribute('aria-hidden','true');return float
        },{key:'canvas-band-'+index,side:-1000+index,ignoreSelection:true,stopEvent:()=>true})))
      }},
    view(view){canvasView=view;const controller=new CanvasController(view);controllers.set(view,controller);return {update:()=>controller.schedule(),destroy:()=>{canvasView=null;controller.destroy()}}},
  })]},
})

export function refreshCanvas(view){const controller=controllers.get(view);if(!controller)return false;controller.refresh();return controller.session!==null||controller.activeCount>0}
export function beginCanvasGesture(view,pos){return controllers.get(view)?.begin(pos)||null}

function canvasAttributes(item,pageWidth){
  return {layout:'canvas',documentFlow:false,offset:rounded(item.box.x/pageWidth*100),gap:rounded(item.box.y),clear:!!item.block,canvasWidth:rounded(item.box.width),layer:item.layer,...(item.image?{width:rounded(item.box.width)}:{})}
}
export function canvasTransaction(state,items,pageWidth,selected,edit){
  const tr=closeHistory(state.tr)
  for(const item of items){
    const current=tr.doc.nodeAt(item.pos)
    if(!current||current.type!==item.node.type)continue
    const attrs={...current.attrs,...canvasAttributes(item,pageWidth)}
    if(Object.keys(attrs).some(key=>attrs[key]!==current.attrs[key]))tr.setNodeMarkup(item.pos,null,attrs)
  }
  edit?.(tr)
  const at=promoteCanvasObject(tr,selected)
  return tr.setSelection(NodeSelection.create(tr.doc,at))
}

// Alignment uses the same coordinates as dragging and keeps the current height.
export function alignCanvasObject(view,pos,layout){
  const session=beginCanvasGesture(view,pos)
  if(!session)return false
  const box=session.target.box
  box.x=layout==='right'?Math.max(0,session.page.width-box.width):0
  session.target.block=!layout
  return session.commit()
}

// A copied object keeps its dimensions, but its new home is the insertion caret.
// An offset keeps multiple objects in a single paste individually reachable.
export function canvasPastePlacement(view,width,index=0){
  if(!controllers.has(view)||view.dom.clientWidth<=560)return null
  const page=view.dom.getBoundingClientRect(),selection=view.state.selection
  let caret
  try{caret=view.coordsAtPos(selection.from)}catch{return null}
  const selected=selection instanceof NodeSelection&&isObject(selection.node)?view.nodeDOM(selection.from)?.getBoundingClientRect():null
  const size=clamp(width||Math.min(320,page.width),1,page.width)
  const x=clamp((selected?.left??caret.left)-page.left+index*24,0,page.width-size)
  const y=Math.max(0,(selected?.top??caret.top)-page.top+index*24)
  return {layout:'canvas',offset:rounded(x/page.width*100),gap:rounded(y),canvasWidth:size,clear:false,layer:Math.max(0,...objects(view).map(item=>item.layer))+index+1}
}

export function createCanvasMover({view,dom,handle,getPos,isEditable,onStart,onClick,preventDefault=false,ignore,root}) {
  let moving=null,frame=0,draggedUntil=0
  handle.title=(handle.title||'Drag to move').replace(/[.\s]+$/,'')+'. Hold Alt/Option to skip snapping.'
  const draw=()=>{
    frame=0
    if(!moving?.session)return
    const {session,at,dx,dy,start}=moving
    const scroller=view.dom.closest('.fn-note-content')
    let scroll=false
    if(scroller){
      const bounds=scroller.getBoundingClientRect(),y=at.y
      const speed=y<bounds.top+44?-Math.min(20,(bounds.top+44-y)/2):y>bounds.bottom-44?Math.min(20,(y-bounds.bottom+44)/2):0
      const before=scroller.scrollTop
      scroller.scrollTop+=speed;scroll=before!==scroller.scrollTop
    }
    const page=view.dom.getBoundingClientRect()
    const raw=canvasPosition(start,at.x-page.left-dx-start.x,at.y-page.top-dy-start.y,page.width)
    const {box,guides}=moving.alignment.snap(raw,page,moving.alt)
    session.target.box=box
    dom.style.transform=`translate3d(${box.x-start.x}px,${box.y-start.y}px,0)`
    session.draw()
    moving.alignment.paint(guides,page)
    if(scroll)frame=requestAnimationFrame(draw)
  }
  const down=event=>{
    // Suppress only the click generated by the completed drag. A fresh press
    // (including on a player control) is a new action, even within 200 ms.
    if(!moving)draggedUntil=0
    if(moving||event.button||event.isPrimary===false||!isEditable()||ignore?.(event.target,event))return
    const own=dom.getBoundingClientRect()
    moving={pointer:event.pointerId,target:event.target,x:event.clientX,y:event.clientY,dx:event.clientX-own.left,dy:event.clientY-own.top,alt:event.altKey,at:{x:event.clientX,y:event.clientY}}
    for(const [type,listener]of Object.entries(listeners))document.addEventListener(type,listener,true)
    // A click must still reach a nested button. Capture only after drag intent
    // is clear; document listeners also catch movement outside a thin stroke.
    if(preventDefault)event.preventDefault()
  }
  const move=event=>{
    if(!moving||event.pointerId!==moving.pointer)return
    moving.at={x:event.clientX,y:event.clientY}
    moving.alt=event.altKey
    if(!moving.session){
      if(Math.hypot(event.clientX-moving.x,event.clientY-moving.y)<5)return
      onStart?.()
      moving.session=beginCanvasGesture(view,getPos())
      if(!moving.session)return
      handle.setPointerCapture(event.pointerId)
      moving.start={...moving.session.target.box}
      moving.alignment=createDragAlignment(view,moving.session,root)
      moving.session.target.block=false
      moving.session.target.layer=Math.max(0,...moving.session.items.map(item=>item.layer))+1
      dom.style.zIndex=String(moving.session.target.layer)
      dom.classList.add('is-moving')
    }
    event.preventDefault()
    if(!frame)frame=requestAnimationFrame(draw)
  }
  const finish=event=>{
    if(!moving||event.pointerId!==undefined&&event.pointerId!==moving.pointer)return
    cancelAnimationFrame(frame);frame=0
    if(moving.session&&event.type==='pointerup'){
      moving.at={x:event.clientX,y:event.clientY};moving.alt=event.altKey;draw();cancelAnimationFrame(frame);frame=0
    }
    const done=moving;moving=null
    for(const [type,listener]of Object.entries(listeners))document.removeEventListener(type,listener,true)
    done.alignment?.destroy()
    dom.classList.remove('is-moving')
    if(handle.hasPointerCapture?.(done.pointer))handle.releasePointerCapture(done.pointer)
    if(!done.session){if(event.type==='pointerup'&&isEditable())onClick?.(event,done.target);return}
    draggedUntil=performance.now()+200
    if(event.type==='pointerup'&&isEditable())done.session.commit()
    else done.session.restore()
  }
  const key=event=>{
    if(!moving)return
    if(event.key==='Escape'&&event.type==='keydown'){event.preventDefault();finish({type:'cancel'})}
    else if(event.key==='Alt'){
      moving.alt=event.type==='keydown'
      if(moving.session&&!frame)frame=requestAnimationFrame(draw)
    }
  }
  const click=event=>{if(performance.now()<draggedUntil&&dom.contains(event.target)){event.preventDefault();event.stopPropagation()}}
  const listeners={pointermove:move,pointerup:finish,pointercancel:finish}
  handle.addEventListener('pointerdown',down)
  handle.addEventListener('lostpointercapture',finish)
  document.addEventListener('click',click,true)
  document.addEventListener('keydown',key,true)
  document.addEventListener('keyup',key,true)
  return {wasDragged:()=>performance.now()<draggedUntil,destroy(){
    if(moving)finish({type:'cancel'})
    handle.removeEventListener('pointerdown',down)
    handle.removeEventListener('lostpointercapture',finish)
    for(const [type,listener]of Object.entries(listeners))document.removeEventListener(type,listener,true)
    document.removeEventListener('click',click,true)
    document.removeEventListener('keydown',key,true)
    document.removeEventListener('keyup',key,true)
  }}
}
