import { quietly } from './editor-dom.js'

// Controls belong to the workspace overlay, not an object's artwork layer.
// Keep their original buttons/listeners, and return them when no longer shown.
const controllers=new WeakMap(), bars=new WeakMap(), owners=new WeakMap()
export const objectToolbar=dom=>bars.get(dom)
export const objectFromTarget=target=>owners.get(target.closest?.('.fn-object-bar'))||target.closest?.('.fn-attachment')

// `root` is the app's element given to createNotebook. Toolbars float in it, above
// every object; without one they stay inside their object.
export function floatObjectTools(editor,view,dom,bar,root) {
  if(!root)return ()=>{}
  let controller=controllers.get(view)
  if(!controller){controller=createController(editor,view,root);controllers.set(view,controller)}
  return controller.add(dom,bar)
}

function createController(editor,view,root) {
  const entries=new Map(),scroller=view.dom.closest('.fn-note-content')||view.dom
  let current,hovered,frame=0,leaveTimer
  const restore=()=>{
    if(!current)return
    const {dom,bar}=current;current=undefined
    quietly(view,()=>{bar.classList.remove('fn-floating-tools');bar.style.removeProperty('left');bar.style.removeProperty('top');dom.append(bar)})
  }
  const update=()=>{
    frame=0
    if(view.isDestroyed)return
    const selected=editor.state.selection.node?view.nodeDOM(editor.state.selection.from):null
    const next=entries.get(hovered)||entries.get(selected)
    if(!next||!next.dom.isConnected||root.querySelector('dialog[open],:is(#fn-format-menu,.fn-format-options):not([hidden]),.fn-context-menu:not([hidden]),.fn-draw-overlay')||next.dom.matches('.is-moving,.is-resizing')){restore();return}
    const box=next.dom.getBoundingClientRect(),clip=scroller.getBoundingClientRect()
    const top=Math.max(clip.top,0),bottom=Math.min(clip.bottom,innerHeight)
    if(box.bottom<top||box.top>bottom||box.right<clip.left||box.left>clip.right){restore();return}
    if(current!==next){restore();current=next;quietly(view,()=>{root.append(next.bar);next.bar.classList.add('fn-floating-tools')})}
    const width=next.bar.offsetWidth,height=next.bar.offsetHeight
    next.bar.style.left=Math.max(8,Math.min(innerWidth-width-8,box.left))+'px'
    next.bar.style.top=Math.max(top+4,Math.min(bottom-height-4,box.top-height-6))+'px'
  }
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(update)}
  const over=event=>{
    const object=objectFromTarget(event.target)
    if(!entries.has(object))return
    clearTimeout(leaveTimer);hovered=object;schedule()
  }
  const out=event=>{
    if(!hovered)return
    const next=event.relatedTarget instanceof Element?objectFromTarget(event.relatedTarget):null
    if(next===hovered)return
    clearTimeout(leaveTimer);leaveTimer=setTimeout(()=>{hovered=undefined;schedule()},120)
  }
  const moving=()=>{if(current?.dom.matches('.is-moving,.is-resizing'))schedule()}
  const events=[['pointerover',over],['pointerout',out],['pointerdown',schedule],['pointermove',moving],['click',schedule],['keydown',schedule],['focusin',schedule]]
  for(const [name,handler] of events)root.addEventListener(name,handler,true)
  document.addEventListener('scroll',schedule,true);window.addEventListener('resize',schedule)
  view.dom.addEventListener('load',schedule,true)
  editor.on('transaction',schedule)
  return {add(dom,bar){
    const entry={dom,bar};entries.set(dom,entry);bars.set(dom,bar);owners.set(bar,dom);bar.dataset.floatingTools='';schedule()
    return ()=>{
      if(current===entry)restore()
      if(hovered===dom)hovered=undefined
      entries.delete(dom);bars.delete(dom);owners.delete(bar)
      if(entries.size){schedule();return}
      cancelAnimationFrame(frame);clearTimeout(leaveTimer)
      for(const [name,handler] of events)root.removeEventListener(name,handler,true)
      document.removeEventListener('scroll',schedule,true);window.removeEventListener('resize',schedule)
      view.dom.removeEventListener('load',schedule,true)
      editor.off('transaction',schedule);controllers.delete(view)
    }
  }}
}
