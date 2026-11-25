import { icon } from './icons.js'
import { drawingData, makeStroke, drawingProjection } from '../format/drawing.mjs'
import { quietly } from './editor-dom.js'
import { closeHistory } from '@tiptap/pm/history'
import { drawingSelectionGuard } from './drawing-selection.js'
import { drawingShortcut, isMacPlatform, insertShortcutLabel } from './editor-shortcuts.js'
import { drawingPath, canStartDrawing } from './drawing-path.js'
import { shapePoints, isShapeTool, shapeIsTiny, shapeName } from './drawing-shapes.js'
import { drawingGroupButtons, drawingPalette } from './drawing-palette.js'
import { matchPenGroup, strokeBounds, boxDistance, isPartialShape, maxJoinDistance } from './shape-group.js'
import { recognitionSamples, recognizeStrokes } from './shape-recognition.js'
import { drawingBox } from './canvas-layout.js'
import { shapeSuggestion } from './shape-suggestion.js'

const sessions = new WeakMap()
const shapeChoices = new WeakMap()
export const isDrawing = editor => sessions.has(editor)
export const stopDrawing = editor => sessions.get(editor)?.()
export function startDrawing(editor, root) {
  if (!editor?.isEditable) return
  if (sessions.has(editor)) { sessions.get(editor)(); return }
  const view = editor.view, scroller = view.dom.closest('.fn-note-content') || document.scrollingElement
  const overlay = document.createElement('canvas'), toolbar = document.createElement('div')
  overlay.className = 'fn-draw-overlay'; overlay.setAttribute('aria-label', 'Drawing canvas');overlay.tabIndex=0
  toolbar.className = 'fn-draw-tools'; toolbar.setAttribute('role','toolbar'); toolbar.setAttribute('aria-label','Drawing tools')
  const mac=isMacPlatform()
  const choices=shapeChoices.get(editor)||{};shapeChoices.set(editor,choices)
  const keys={pen:'P',highlighter:'H',line:'L',arrow:'A',rectangle:'R',ellipse:'O',diamond:'D',eraser:'E',undo:mac?'⌘Z':'Ctrl+Z',redo:mac?'⌘⇧Z':'Ctrl+Shift+Z'}
  const toolButton = (key,label,glyph,selected=false) => `<button type="button" class="fn-icon" data-tool="${key}" title="${label} (${keys[key]})" aria-label="${label}" aria-keyshortcuts="${keys[key]}" aria-pressed="${selected}">${icon(glyph)}</button>`
  const actionButton = (key,label,glyph) => `<button type="button" class="fn-icon" data-draw="${key}" title="${label}${keys[key]?' ('+keys[key]+')':''}" aria-label="${label}">${icon(glyph)}</button>`
  // Clear inks that read on light and dark pages; the picker offers any other.
  const inks=[['#15805e','Green'],['#2563eb','Blue'],['#dc2626','Red'],['#ea580c','Orange'],['#7c3aed','Violet'],['#64748b','Grey']]
  toolbar.innerHTML = toolButton('pen','Pen','pencil',true)+toolButton('highlighter','Highlighter','highlighter')+drawingGroupButtons(choices)+toolButton('eraser','Eraser','eraser')
    +'<span class="fn-tool-divider"></span>'+inks.map(([value,name],index)=>`<button type="button" class="fn-swatch" data-ink="${value}" title="${name} (${index+1})" aria-label="${name} ink" aria-keyshortcuts="${index+1}" aria-pressed="${index===0}"></button>`).join('')
    +'<input type="color" aria-label="Other ink color" title="Other color" value="#15805e"><span class="fn-tool-divider"></span><input type="range" aria-label="Stroke thickness" title="Stroke thickness" min="1" max="24" value="3"><span class="fn-tool-divider"></span>'+actionButton('undo','Undo','undo-2')+actionButton('redo','Redo','redo-2')+actionButton('extend','More room','file-plus-2')+'<button type="button" data-draw="done">Done</button>'
  // Through the style object: a page's policy may forbid inline style attributes.
  toolbar.querySelectorAll('[data-ink]').forEach(swatch=>swatch.style.setProperty('--swatch',swatch.dataset.ink))
  const colorInput=toolbar.querySelector('[type=color]')
  const markInk=()=>toolbar.querySelectorAll('[data-ink]').forEach(swatch=>swatch.setAttribute('aria-pressed',String(swatch.dataset.ink===colorInput.value.toLowerCase())))
  colorInput.addEventListener('input',markInk)

  root.append(overlay,toolbar)
  const suggestion = shapeSuggestion(toolbar, overlay, view.dom)
  toolbar.querySelector('[data-tool=pen]').title = 'Pen (P). Sketch a shape, then lift or hold. Tap an earlier sketch to see its suggestion.'
  const selectionGuard=drawingSelectionGuard(view,view.dom.closest('.fn-paper')||view.dom,document,()=>overlay.focus({preventScroll:true}))
  toolbar.querySelector('[type=range]').title='Stroke thickness ([ / ])'
  toolbar.querySelector('[data-draw=done]').title=`Done (Esc or ${insertShortcutLabel('drawing',mac)})`
  toolbar.querySelector('[data-draw=done]').setAttribute('aria-keyshortcuts','Escape')
  overlay.focus({preventScroll:true})
  const context = overlay.getContext('2d')
  let room = Math.max(view.dom.clientHeight, scroller.clientHeight) + 200
  const extend = () => quietly(view,()=>view.dom.style.setProperty('--fn-draw-room', room+'px'))
  extend()
  let tool = 'pen', path = null, pointer, oldDoc, erased = new Set(), frame
  let holdTimer, holdAnchor, preview
  const composableLines = new WeakSet()
  let previewObjects = []
  function revealInk() {
    if (previewObjects.length) quietly(view, () => {
      for (const dom of previewObjects) dom.classList.remove('fn-shape-preview-source')
    })
    previewObjects = []
  }
  function resetHold() {
    revealInk()
    clearTimeout(holdTimer)
    holdAnchor = null
    preview = null
  }
  function matchStroke(saved) {
    if (tool !== 'pen' || path?.segments?.length !== 1) return null
    const points = saved?.points || path.segments[0]
    if (points.length < 2) return null
    const area = strokeBounds(points)
    const page = view.dom.getBoundingClientRect(), nearby = []
    const ink = saved?.raw.attrs.drawing.color ?? colorInput.value
    const thickness = saved?.raw.attrs.drawing.size ?? inkSize()
    // Project from saved ink. A fast second stroke may arrive before the
    // layout frame paints the first one, especially with a pen or trackpad.
    view.state.doc.forEach((node, position) => {
      const a = node.attrs, d = a.drawing
      if (position === saved?.position || !d || d.points.length < 2 || a.layout !== 'canvas' || d.opacity !== 1 || d.color !== ink ||
          d.size !== thickness || (a.label !== 'Drawing' && !composableLines.has(node))) return
      const rect = drawingBox(a, page.width)
      const projection = drawingProjection(a,rect)
      const first = projection.point(d.points[0]), last = projection.point(d.points.at(-1))
      const seam = Math.hypot(first[0]-last[0],first[1]-last[1])
      if (seam <= 7 && seam <= Math.max(rect.width,rect.height) * .18) return
      const box = {left:rect.x,right:rect.x+rect.width,top:rect.y,
        bottom:rect.y+rect.height,span:Math.max(rect.width,rect.height)}
      const gap = boxDistance(area,box)
      nearby.push({node,position,box,gap,projection})
    })
    const candidates = nearby.sort((a,b)=>a.gap-b.gap || b.position-a.position).slice(0,16)
    // Further sides can connect through an intermediate stroke, but at least
    // one candidate must be within the maximum join distance of this stroke.
    if (candidates.length && candidates[0].gap > maxJoinDistance) candidates.length = 0
    for (const entry of candidates) {
      entry.points = recognitionSamples(entry.node.attrs.drawing.points).map(entry.projection.point)
      entry.box = strokeBounds(entry.points)
    }
    const match = matchPenGroup(points,candidates)
    if (!match) return null
    // Rotating a fitted outline can put a corner just beyond the original ink.
    const left=path.box.left, right=path.box.right, top=0
    const bottom=Math.max(view.dom.clientHeight,path.box.bottom)
    match.points = match.points.map(([x, y]) => [
      Math.max(left, Math.min(right, x)), Math.max(top, Math.min(bottom, y)),
    ])
    return match
  }
  function tappedSketch() {
    if (tool !== 'pen' || path.segments.length !== 1 || strokeBounds(path.segments[0]).span > 3) return null
    const [x,y] = path.segments[0][0], width = view.dom.getBoundingClientRect().width
    let hit
    view.state.doc.forEach((raw, position) => {
      const a = raw.attrs, ink = a.drawing
      if (!ink || ink.opacity !== 1 || a.layout !== 'canvas' || ink.points.length < 2) return
      const box = drawingBox(a,width), projection = drawingProjection(a,box), radius = 5+projection.scale*ink.size/2
      if (x < box.x-radius || x > box.x+box.width+radius || y < box.y-radius || y > box.y+box.height+radius) return
      if ((!hit || a.layer >= hit.raw.attrs.layer) && projection.hit(x,y,5))
        hit = {raw,position,box,projection,scale:projection.scale}
    })
    if (!hit) return null
    hit.points = hit.raw.attrs.drawing.points.map(hit.projection.point)
    if (hit.raw.attrs.label === 'Drawing') {
      const match = matchStroke(hit)
      return match && {...hit,match,revisited:true}
    }
    // A saved shape can be corrected after reopening the document, even if
    // its original freehand points are no longer in the undo history.
    if (Math.hypot(hit.points[0][0]-hit.points.at(-1)[0],hit.points[0][1]-hit.points.at(-1)[1]) > 3) return null
    const match = recognizeStrokes([hit.points])
    return match && {...hit,match:{...match,points:hit.points,members:[]},revisited:true,changeOnly:true}
  }
  function watchHold(event) {
    if (tool !== 'pen') return
    const at = [event.clientX, event.clientY]
    if (holdAnchor && Math.hypot(at[0] - holdAnchor[0], at[1] - holdAnchor[1]) <= 5) return
    resetHold()
    holdAnchor = at
    holdTimer = setTimeout(() => {
      if (!path || oldDoc !== view.state.doc || !editor.isEditable) return
      preview = matchStroke()
      if (preview) {
        previewObjects = preview.members.map(entry=>view.nodeDOM(entry.position)).filter(Boolean)
        if (previewObjects.length) quietly(view, () => {
          for (const dom of previewObjects) dom.classList.add('fn-shape-preview-source')
        })
        cancelAnimationFrame(frame); paint()
      }
    }, 500)
  }
  const inkSize=()=>Math.min(40,Number(toolbar.querySelector('[type=range]').value)*(tool==='highlighter'?4:1))
  const geometry = () => {
    if (editor.isDestroyed) return
    const paper = view.dom.getBoundingClientRect(), bounds = scroller.getBoundingClientRect()
    const top = Math.max(paper.top, bounds.top), bottom = Math.min(paper.bottom, bounds.bottom)
    Object.assign(overlay.style, { left:paper.left+'px', top:top+'px', width:paper.width+'px', height:Math.max(0,bottom-top)+'px' })
    overlay.width = Math.round(paper.width*devicePixelRatio); overlay.height = Math.round(Math.max(0,bottom-top)*devicePixelRatio)
    suggestion.position()
  }
  // A shape is one outline, redrawn from its anchor to the pointer on every move.
  const lines = () => !path ? [] : path.shape ? (path.start ? [shapePoints(path.shape,path.start,path.end,{shift:path.shift,alt:path.alt,size:inkSize(),box:path.box})] : []) : path.segments
  const paint = () => {
    frame = null
    const segments = preview ? [preview.points] : lines()
    if (!segments.length) return
    const box = overlay.getBoundingClientRect(), paper = view.dom.getBoundingClientRect()
    context.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0); context.clearRect(0,0,box.width,box.height)
    context.strokeStyle = toolbar.querySelector('[type=color]').value
    context.lineWidth = Math.min(40, Number(toolbar.querySelector('[type=range]').value) * (tool === 'highlighter' ? 4 : 1))
    context.globalAlpha = tool === 'highlighter' ? .3 : 1; context.lineCap = context.lineJoin = 'round'
    context.beginPath()
    for(const points of segments){
      points.forEach(([x,y],index) => context[index ? 'lineTo' : 'moveTo'](x,y+paper.top-box.top))
      if (points.length === 1) context.lineTo(points[0][0]+.01,points[0][1]+paper.top-box.top)
    }
    context.stroke()
  }
  const point = event => {
    const paper = view.dom.getBoundingClientRect()
    return [event.clientX-paper.left,event.clientY-paper.top]
  }
  const erase = event => {
    view.state.doc.descendants((node,pos) => {
      const ink = drawingData(node.attrs.drawing), dom = ink && view.nodeDOM(pos)
      if (!dom) return
      const rect = dom.getBoundingClientRect()
      if (drawingProjection(node.attrs,rect).hit(event.clientX,event.clientY,8)) {
        erased.add(pos); dom.classList.add('is-erasing')
      }
    })
  }
  const cancel = () => {
    resetHold()
    const held=pointer
    path = null; pointer = null; cancelAnimationFrame(frame); context.clearRect(0,0,overlay.width,overlay.height)
    if(held!=null&&overlay.hasPointerCapture(held))overlay.releasePointerCapture(held)
    view.dom.querySelectorAll('.is-erasing').forEach(dom => dom.classList.remove('is-erasing')); erased.clear()
  }
  const sample=event=>{
    const paper=view.dom.getBoundingClientRect(),visible=overlay.getBoundingClientRect(),inset=inkSize()/2
    const bounds={left:inset,right:Math.max(inset,paper.width-inset),top:visible.top-paper.top+inset,bottom:visible.bottom-paper.top-inset}
    if(bounds.bottom<bounds.top)return
    if(tool==='eraser'){
      if(event.clientX>=visible.left&&event.clientX<=visible.right&&event.clientY>=visible.top&&event.clientY<=visible.bottom)erase(event)
    }else if(path.shape){
      const [x,y]=point(event),at=[Math.max(bounds.left,Math.min(bounds.right,x)),Math.max(bounds.top,Math.min(bounds.bottom,y))]
      path.start||=at;path.end=at;path.box=bounds;path.shift=event.shiftKey;path.alt=event.altKey
    }else { path.box=bounds; path.add(point(event),bounds) }
  }
  const down = event => {
    if (!event.target.closest?.('.fn-shape-suggestion')) suggestion.hide()
    if (pointer != null || event.button || event.isPrimary === false || !canStartDrawing(event.target,overlay,scroller)) return
    event.preventDefault();overlay.focus({preventScroll:true})
    if(palette.isOpen){palette.close();return}
    if(selectionGuard.clear())return
    pointer=event.pointerId; oldDoc=view.state.doc; path=isShapeTool(tool)?{shape:tool}:drawingPath()
    overlay.setPointerCapture(pointer)
    sample(event);watchHold(event);paint()
  }
  const move = event => {
    if(event.pointerId !== pointer) return
    event.preventDefault()
    for(const next of event.getCoalescedEvents?.().length ? event.getCoalescedEvents() : [event]) { sample(next); watchHold(next) }
    if(!frame)frame=requestAnimationFrame(paint)
  }
  const up = event => {
    if(event.pointerId !== pointer) return
    sample(event)
    if (holdAnchor && Math.hypot(event.clientX - holdAnchor[0], event.clientY - holdAnchor[1]) > 5) resetHold()
    let recognized
    if(view.state.doc === oldDoc && editor.isEditable) {
      const tapped = tappedSketch()
      if (tapped) { cancel(); offerShape(tapped); return }
      const tr=closeHistory(view.state.tr)
      if(tool === 'eraser') {
        for(const pos of [...erased].sort((a,b)=>b-a)) tr.delete(pos,pos+tr.doc.nodeAt(pos).nodeSize)
      } else {
        const size=inkSize()
        let layer=0;tr.doc.forEach(node=>{layer=Math.max(layer,Number(node.attrs.layer)||0)})
        const last=tr.doc.lastChild,position=tr.doc.content.size-(last?.type.name==='paragraph'&&!last.content.size?last.nodeSize:0)
        const shape=path.shape, tiny=shape&&(!path.start||shapeIsTiny(shape,path.start,path.end))
        const strokes=(tiny?[]:lines()).map(points=>makeStroke(points,size,toolbar.querySelector('[type=color]').value,tool==='highlighter'?.3:1)).filter(stroke=>stroke.drawing)
        const label=shape?shapeName(shape):'Drawing'
        if(strokes.length)tr.insert(position,strokes.map((stroke,index)=>editor.schema.nodes.previewAttachment.create({label,drawing:stroke.drawing,drawingPageWidth:view.dom.clientWidth,width:stroke.drawing.width,canvasWidth:stroke.drawing.width,layout:'canvas',offset:stroke.left/view.dom.clientWidth*100,gap:stroke.top,layer:layer+index+1})))
        if (tool === 'pen' && strokes.length === 1) {
          const match = preview || matchStroke()
          if (match) recognized = { match, position, raw: tr.doc.nodeAt(position), held: !!preview && !match.confirm }
        }
      }
      if(tr.docChanged) { view.dispatch(tr); view.dispatch(closeHistory(view.state.tr)) }
    }
    cancel()
    if (recognized) offerShape(recognized)
  }
  function offerShape({ match, position, raw, held, scale = 1, revisited, changeOnly }) {
    const {size, color, opacity} = raw.attrs.drawing
    const pageWidth = view.dom.clientWidth
    const sources = [...match.members,{node:raw,position}].sort((a,b)=>a.position-b.position)
    const top = sources.reduce((best,source) => source.node.attrs.layer >= best.node.attrs.layer ? source : best)
    const closed = match.points.length > 3 && !isPartialShape(match.tool) &&
      Math.hypot(match.points[0][0]-match.points.at(-1)[0],match.points[0][1]-match.points.at(-1)[1]) < 4
    const alternatives = []
    if (closed && (revisited || match.confirm || match.tool === 'speech-bubble')) {
      const box = strokeBounds(match.points)
      for (const tool of ['rectangle','ellipse','triangle','star']) {
        if (tool === match.tool && !(tool === 'star' && match.label !== 'Five-point star')) continue
        let points = shapePoints(tool,[box.left,box.top],[box.right,box.bottom])
        // The published bubble outline has four body corners and a projecting tail.
        if (tool === 'rectangle' && match.tool === 'speech-bubble' && match.points.length === 8)
          points = [0,1,2,6,0].map(index=>match.points[index])
        alternatives.push({tool,points})
      }
    }
    function convert(choice = match) {
      const stroke = makeStroke(choice.points, Math.min(40,size*scale), color, opacity)
      if (!stroke.drawing) return
      const attrs = {
        ...raw.attrs, layer:top.node.attrs.layer, label: choice.label || shapeName(choice.tool), drawing: stroke.drawing,
        width: stroke.drawing.width, canvasWidth: stroke.drawing.width, frameRatio: 0, mediaRotation: 0,
        drawingPageWidth: pageWidth, offset: stroke.left / pageWidth * 100, gap: stroke.top,
      }
      if (!editor.isEditable || !sources.every(s=>view.state.doc.nodeAt(s.position)===s.node)) return
      const tr = closeHistory(view.state.tr)
      // Replace the newest stroke at its own layer. Remove only the identities
      // contributing to this fit, even when other objects sit between them.
      tr.setNodeMarkup(top.position, undefined, attrs)
      for (const source of [...sources].reverse()) {
        if (source.position !== top.position) tr.delete(source.position,source.position+source.node.nodeSize)
      }
      const clean = tr.doc.nodeAt(tr.mapping.map(top.position, -1))
      if (clean && isPartialShape(choice.tool)) composableLines.add(clean)
      const before = view.state.doc
      const inverse = tr.steps.map((step,i)=>step.invert(tr.docs[i])).reverse()
      view.dispatch(tr)
      view.dispatch(closeHistory(view.state.tr))
      const converted = view.state.doc
      return () => {
        if (!editor.isEditable || view.state.doc !== converted || !converted.eq(tr.doc)) return
        const restore = closeHistory(view.state.tr)
        for (const step of inverse) restore.step(step)
        if (!restore.doc.eq(before)) return
        view.dispatch(restore)
        view.dispatch(closeHistory(view.state.tr))
      }
    }
    if (held) {
      const restore = convert()
      if (restore) suggestion.show(match, true, restore)
    } else if (view.state.doc.nodeAt(position) === raw) {
      suggestion.show(match, false, convert, alternatives, changeOnly && alternatives.length > 0)
    }
  }
  // Invalidate the offered positions if any document content changes.
  const documentChanged = ({ transaction }) => { if (transaction.docChanged) suggestion.hide() }
  editor.on('transaction', documentChanged)
  const cancelled=event=>{if(event.pointerId===undefined||event.pointerId===pointer)cancel()}
  const events={pointerdown:down,pointermove:move,pointerup:up,pointercancel:cancelled}
  for(const [name,handler] of Object.entries(events))document.addEventListener(name,handler,true)
  overlay.onlostpointercapture=cancelled
  window.addEventListener('blur',cancel)
  overlay.onwheel=event=>{event.preventDefault();scroller.scrollTop+=event.deltaY}
  const close=(restoreFocus=true)=>{
    editor.off('transaction', documentChanged);suggestion.hide()
    cancel();palette.destroy();overlay.remove();toolbar.remove();sessions.delete(editor)
    selectionGuard.destroy()
    quietly(view,()=>view.dom.style.removeProperty('--fn-draw-room'))
    scroller.removeEventListener('scroll',geometry);window.removeEventListener('resize',geometry)
    document.removeEventListener('keydown',key,true);editor.off('destroy',destroy)
    document.removeEventListener('keydown',modifiers,true);document.removeEventListener('keyup',modifiers,true)
    for(const [name,handler] of Object.entries(events))document.removeEventListener(name,handler,true)
    window.removeEventListener('blur',cancel)
    if(restoreFocus&&!editor.isDestroyed)view.focus()
  }
  const destroy=()=>close(false)
  const choose=next=>{tool=next;palette.select(next);toolbar.querySelectorAll('[data-tool]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.tool===tool)))}
  const palette=drawingPalette({toolbar,root,choices,onChoose:next=>{choose(next);overlay.focus({preventScroll:true})}})
  const history=action=>{cancel();editor.commands[action]();selectionGuard.clear();overlay.focus({preventScroll:true})}
  const key=event=>{
    if(palette.key(event))return
    const pageFocus=event.target===document.body||event.target===document.documentElement||event.target===root||event.target.matches('.fn-note-pane')
    if(!pageFocus&&!root.contains(event.target)||event.target.closest('input,textarea,select,dialog,[role=dialog]')||root.querySelector('dialog[open],:is(#fn-format-menu,.fn-format-options):not([hidden])'))return
    if(!pageFocus&&!event.target.closest('.fn-note-content,.fn-draw-overlay,.fn-draw-tools,.fn-formatbar'))return
    if(suggestion.key(event))return
    const action=drawingShortcut(event,mac)
    if(!action)return
    suggestion.hide()
    event.preventDefault();event.stopPropagation()
    // Escape first drops a stroke or shape still being drawn, then leaves drawing.
    if(action==='done'){if(path)cancel();else close();return}
    if(action==='clear-selection'){selectionGuard.clear();return}
    if(action==='undo'||action==='redo'){history(action);return}
    // Do not change ink type or thickness halfway through an unfinished stroke.
    if(path)return
    if(action==='thinner'||action==='thicker'){
      const size=toolbar.querySelector('[type=range]')
      size.value=String(Math.max(1,Math.min(24,Number(size.value)+(action==='thinner'?-1:1))))
    }else if(action.startsWith('ink-')){
      const swatch=toolbar.querySelectorAll('[data-ink]')[Number(action.slice(4))-1]
      if(swatch){colorInput.value=swatch.dataset.ink;markInk()}
    }else choose(action)
  }
  // Shift and Alt (Option) reshape a shape mid-drag, even without moving the pointer.
  const modifiers=event=>{
    if(!path?.shape||(event.key!=='Shift'&&event.key!=='Alt'))return
    if(event.key==='Alt')event.preventDefault()
    path.shift=event.shiftKey;path.alt=event.altKey
    if(!frame)frame=requestAnimationFrame(paint)
  }
  toolbar.onmousedown=event=>{if(event.target.closest('button'))event.preventDefault()}
  toolbar.onclick=event=>{
    const button=event.target.closest('button');if(!button)return
    suggestion.hide()
    if(button.dataset.drawGroup){palette.open(button);return}
    palette.close()
    overlay.focus({preventScroll:true})
    if(button.dataset.ink){colorInput.value=button.dataset.ink;markInk()}
    if(button.dataset.tool)choose(button.dataset.tool)
    if(button.dataset.draw==='done')close()
    if(button.dataset.draw==='extend'){const previous=room;room+=Math.max(400,scroller.clientHeight);extend();scroller.scrollTop+=view.dom.getBoundingClientRect().top-scroller.getBoundingClientRect().top+previous-scroller.clientHeight*.25;geometry()}
    if(button.dataset.draw==='undo')history('undo')
    if(button.dataset.draw==='redo')history('redo')
  }
  sessions.set(editor,close);editor.on('destroy',destroy);document.addEventListener('keydown',key,true)
  document.addEventListener('keydown',modifiers,true);document.addEventListener('keyup',modifiers,true)
  scroller.addEventListener('scroll',geometry,{passive:true});window.addEventListener('resize',geometry);geometry()
}
