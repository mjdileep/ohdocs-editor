// Shared by the editing canvas and the read-only published document.
import { rotatedSize } from '../format/media-geometry.mjs'
import { quietly } from './editor-dom.js'
import { wrappingBands } from './wrap-bands.js'

const isObject = node => node.type.name === 'previewAttachment' || node.type.name === 'table' || node.type.name === 'codeBlock'
export const finite = (value, fallback=0) => Number.isFinite(Number(value)) ? Number(value) : fallback
export const clamp = (value,min,max) => Math.max(min,Math.min(max,finite(value)))
export const rounded = value => Math.round(value*100)/100

// Ink keeps its page coordinates even when the surrounding content reflows.
// Use the same projection for drawing gestures and for painting saved nodes.
export function drawingBox(attrs, pageWidth) {
  const scale = pageWidth <= 560 ? Math.min(1, pageWidth / (attrs.drawingPageWidth || pageWidth)) : 1
  const width = clamp((attrs.canvasWidth || attrs.width || attrs.drawing.width) * scale, 1, pageWidth)
  const ratio = clamp(attrs.frameRatio, 0, 10000) || attrs.drawing.width / attrs.drawing.height
  const bounds = rotatedSize(ratio,1,attrs.mediaRotation)
  return {
    x: Math.min(clamp(attrs.offset, 0, 100) * pageWidth / 100, pageWidth - width),
    y: clamp(attrs.gap, 0, 100000) * scale, width,
    height: width * bounds.height / bounds.width,
  }
}

export function paintObject(dom, box, layer) {
  dom.classList.add('fn-canvas-object')
  Object.assign(dom.style,{left:box.x+'px',top:box.y+'px',width:box.width+'px',zIndex:String(layer)})
}
export function objects(view, includeFlowAt = -1) {
  const page=view.dom.getBoundingClientRect(), result=[]
  const add=(node,pos,nested=false)=>{
    if (!isObject(node) || node.attrs.documentFlow && pos !== includeFlowAt) return
    const dom=view.nodeDOM(pos)
    if (!(dom instanceof HTMLElement)) return
    const rect=dom.getBoundingClientRect()
    result.push({node,pos,dom,nested,image:dom.classList.contains('fn-image'),block:node.attrs.layout==='canvas'&&node.attrs.clear,box:{x:rect.left-page.left,y:rect.top-page.top,width:rect.width,height:rect.height},layer:finite(node.attrs.layer)})
  }
  view.state.doc.forEach((node,pos)=>add(node,pos))
  if(includeFlowAt>=0&&!result.some(item=>item.pos===includeFlowAt)){
    const node=view.state.doc.nodeAt(includeFlowAt)
    if(node)add(node,includeFlowAt,true)
  }
  return result
}
export const exclusions=(items,width)=>items.filter(item=>!item.node.attrs.drawing).map(item=>item.block?{...item.box,x:0,width}:item.box)
export function drawBands(view, boxes, width) {
  const floats=view.dom.querySelectorAll(':scope > .fn-wrap-band')
  if (!floats.length) return
  const minimum=parseFloat(getComputedStyle(view.dom).fontSize)*12
  const bands=wrappingBands(boxes,width,minimum)
  quietly(view,()=>{
    // Reuse the floats. No document mutations, position search or forced layout
    // reads occur in the pointer-frame write pass.
    for(let index=0;index<floats.length/2;index++){
      const band=bands[index]||{left:0,right:0,height:0}
      const left=floats[index*2],right=floats[index*2+1]
      Object.assign(left.style,{float:'left',clear:'both',width:band.left+'px',height:band.height+'px'})
      Object.assign(right.style,{float:'right',clear:'none',width:band.right+'px',height:band.height+'px'})
    }
  })
}

export class CanvasLayout {
  constructor(view) {
    this.view=view;this.frame=0;this.session=null;this.observed=new Set()
    this.observer=new ResizeObserver(()=>this.schedule())
    this.observer.observe(view.dom)
    this.load=()=>this.schedule()
    view.dom.addEventListener('load',this.load,true)
    this.schedule()
  }
  schedule() {if(!this.destroyed&&!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=0;this.refresh()})}
  refresh() {
    if(this.destroyed||this.view.isDestroyed||this.session)return
    const view=this.view,page=view.dom.getBoundingClientRect()
    quietly(view,()=>view.dom.classList.toggle('fn-canvas-stacked',page.width<=560))
    let items=objects(view)
    const inkHeight = () => quietly(view,()=>view.dom.style.setProperty('--fn-ink-height', Math.max(0,...items.filter(item=>item.node.attrs.drawing).map(item=>parseFloat(item.dom.style.top)+item.dom.getBoundingClientRect().height))+'px'))
    const current=new Set(items.flatMap(item=>[item.dom,...item.dom.querySelectorAll('table')]))
    for(const dom of this.observed)if(!current.has(dom))this.observer.unobserve(dom)
    for(const dom of current)if(!this.observed.has(dom))this.observer.observe(dom)
    this.observed=current
    if(page.width<=560){
      quietly(view,()=>{for(const item of items){
        if(item.dom.classList.contains('is-resizing'))continue
        if(item.node.attrs.drawing){
          paintObject(item.dom,drawingBox(item.node.attrs,page.width),item.layer)
          continue
        }
        item.dom.classList.toggle('fn-canvas-object',item.node.attrs.layout==='canvas')
        for(const property of ['left','top','z-index','transform'])item.dom.style.removeProperty(property)
        const width=item.node.attrs.width||item.node.attrs.canvasWidth
        item.dom.style.width=width?width+'px':''
      }})
      inkHeight();drawBands(view,[],page.width);this.activeCount=0;return
    }
    // A legacy note must finish its first image layout before taking a geometry
    // snapshot; otherwise an uncached image's zero height would overlap objects.
    if(items.some(item=>{
      const image=item.dom.classList.contains('fn-video')?null:item.dom.querySelector('img')
      return item.node.attrs.layout!=='canvas'&&image&&(!image.complete||item.dom.classList.contains('is-loading'))&&!image.hasAttribute('height')
    }))return
    // Undo can restore the old float attributes. Measure that original flow
    // without the previous canvas's exclusions pushing it down the page.
    if(items.some(item=>item.node.attrs.layout!=='canvas'&&!item.dom.classList.contains('fn-canvas-object'))){
      quietly(view,()=>{
        for(const item of items)if(item.node.attrs.layout!=='canvas'){
          item.dom.classList.remove('fn-canvas-object')
          for(const property of ['left','top','z-index','transform'])item.dom.style.removeProperty(property)
          const width=item.node.attrs.width||item.node.attrs.canvasWidth
          item.dom.style.width=width?width+'px':''
        }
        drawBands(view,exclusions(items.filter(item=>item.node.attrs.layout==='canvas'),page.width),page.width)
      })
      items=objects(view)
    }
    // Older notes are projected from their current visible rectangles without
    // rewriting the document. Their first gesture saves that projection in the
    // same undo step as the gesture.
    const placed=items
    quietly(view,()=>{
      for(const item of placed){
        const a=item.node.attrs
        if(a.layout!=='canvas') {paintObject(item.dom,item.box,item.layer);continue}
        if(a.drawing){
          item.box=drawingBox(a,page.width)
          paintObject(item.dom,item.box,item.layer)
          continue
        }
        let width=clamp(a.canvasWidth||a.width||item.box.width,1,page.width)
        if(item.node.type.name==='table'){
          const table=item.dom.querySelector('table'),stored=parseFloat(table?.style.width)
          if(stored>0)width=Math.min(page.width,stored+2)
        }
        const x=clamp(a.offset,0,100)*page.width/100
        item.box={...item.box,x:Math.min(x,Math.max(0,page.width-width)),y:clamp(a.gap,0,100000),width}
        paintObject(item.dom,item.box,item.layer)
      }
    })
    // Heights can change after editing table cells or after a picture loads.
    for(const item of placed)item.box.height=item.dom.getBoundingClientRect().height
    inkHeight()
    drawBands(view,exclusions(placed,page.width),page.width)
    this.activeCount=placed.length
  }
  destroy(){this.destroyed=true;cancelAnimationFrame(this.frame);this.observer.disconnect();this.view.dom.removeEventListener('load',this.load,true);this.session?.restore()}
}
