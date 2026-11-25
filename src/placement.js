import { NodeSelection } from '@tiptap/pm/state'
import { closeHistory } from '@tiptap/pm/history'
import { quietly } from './editor-dom.js'
import { createCanvasMover, refreshCanvas, alignCanvasObject } from './canvas-flow.js'
export { quietly } from './editor-dom.js'

// Canvas objects store an x percentage (offset), y pixels (gap), width and layer.
// Text exclusions are separate from object geometry. Older float placements
// remain readable and narrow pages use ordinary document-order movement.
export const layouts = ['left', 'right', 'free', 'canvas']
const closest = -12
const number = (name, limit, floor = 0, html = name) => ({
  default: 0,
  parseHTML: element => Math.max(floor, Math.min(limit, Number(element.getAttribute('data-' + html)) || 0)),
  renderHTML: attributes => attributes[name] ? { ['data-' + html]: attributes[name] } : {},
})
export const placementAttributes = {
  documentFlow: { default: false, parseHTML: element => element.hasAttribute('data-document-flow'), renderHTML: attrs => attrs.documentFlow ? { 'data-document-flow': '' } : {} },
  layout: {
    default: null,
    parseHTML: element => layouts.includes(element.getAttribute('data-layout')) ? element.getAttribute('data-layout') : null,
    renderHTML: attributes => attributes.layout ? { 'data-layout': attributes.layout } : {},
  },
  offset: number('offset', 100),
  gap: number('gap', 100000, closest),
  canvasWidth: number('canvasWidth', 10000, 0, 'canvas-width'),
  frameRatio: number('frameRatio', 10000, 0, 'frame-ratio'),
  minHeight: number('minHeight', 10000, 0, 'min-height'),
  layer: number('layer', 1000000),
  clear: {
    default: false,
    parseHTML: element => element.hasAttribute('data-clear'),
    renderHTML: attributes => attributes.clear ? { 'data-clear': '' } : {},
  },
}
export const unplaced = { layout: null, offset: 0, gap: 0, clear: false, canvasWidth: 0, layer: 0, documentFlow: false }
// Two objects placed side by side must both fit, with room for their margins.
export const sideWidth = page => Math.max(96, Math.floor((page - 84) / 2))

export function applyPlacement(dom, attributes) {
  for (const [name, value, unit] of [['--fn-frame-ratio', attributes.frameRatio, ''], ['--fn-min-height', attributes.minHeight, 'px']]) {
    if (Number.isFinite(value) && value > 0) dom.style.setProperty(name, Math.min(value, 10000) + unit)
    else dom.style.removeProperty(name)
  }
  if (Number.isFinite(attributes.frameRatio) && attributes.frameRatio > 0) dom.dataset.frameRatio = String(attributes.frameRatio)
  else delete dom.dataset.frameRatio
  const canvas=attributes.layout==='canvas', wasCanvas=dom.classList.contains('fn-canvas-object')
  dom.classList.toggle('fn-canvas-object',canvas)
  if(canvas){
    dom.style.left=(Number(attributes.offset)||0)+'%'
    dom.style.top=Math.max(0,Number(attributes.gap)||0)+'px'
    dom.style.zIndex=String(Number(attributes.layer)||0)
    if(attributes.canvasWidth)dom.style.width=attributes.canvasWidth+'px'
  }else if(wasCanvas){for(const name of ['left','top','width','z-index','transform'])dom.style.removeProperty(name)}
  if (attributes.layout) dom.dataset.layout = attributes.layout
  else delete dom.dataset.layout
  if (attributes.layout && attributes.offset) dom.style.setProperty('--offset', attributes.offset + '%')
  else dom.style.removeProperty('--offset')
  if (attributes.gap) dom.style.setProperty('--gap', attributes.gap + 'px')
  else dom.style.removeProperty('--gap')
  if (attributes.layout && attributes.clear) dom.dataset.clear = ''
  else delete dom.dataset.clear
}

const transient = /ProseMirror-(gapcursor|separator|trailingBreak)|fn-wrap-band/
const blocksAround = (view, ...skip) => [...view.dom.children].filter(element => !skip.includes(element) && element.getClientRects().length && !transient.test(element.className))
// Placed beside text, as opposed to standing on a line of its own.
const floating = element => element.dataset.layout === 'left' || element.dataset.layout === 'right'
const placementOf = element => ({ layout: element.dataset.layout || null, offset: parseFloat(element.style.getPropertyValue('--offset')) || 0, gap: parseFloat(element.style.getPropertyValue('--gap')) || 0, clear: 'clear' in element.dataset })
// The line a placed object hangs from: the bottom of the last ordinary block
// before it. When that block moves, the object rightly moves with it.
function lineAbove(element, skip, page) {
  let previous = element.previousElementSibling
  while (previous && (skip.includes(previous) || floating(previous) || transient.test(previous.className) || !previous.getClientRects().length)) previous = previous.previousElementSibling
  return previous ? previous.getBoundingClientRect().bottom : page.top
}
// Where each placed object sits now, so it can be held there while another moves.
const positions = (view, skip) => {
  const page = view.dom.getBoundingClientRect()
  return blocksAround(view, ...skip).filter(floating).map(element => {
    const rect = element.getBoundingClientRect()
    return { element, was: placementOf(element), left: rect.left - page.left, rise: rect.top - lineAbove(element, skip, page) }
  })
}
// Text flows into whatever room is left beside placed objects, however little:
// a pocket one word wide gets one word per line. Where the room beside an object
// is too narrow for a readable line, the object claims it (`--fill` widens its
// margin on that side), so the text carries on below instead. The least width
// is twelve times the note's text size (about five words), so larger type asks
// for more room.
export function tidyChannels(view) {
  if(refreshCanvas(view))return
  const all = [...view.dom.children].filter(element => floating(element) && !element.classList.contains('is-moving') && element.getClientRects().length)
  if (!all.length) return
  quietly(view, () => {
    // Measure with nothing claimed, so a claim never props itself up.
    for (const element of all) element.style.removeProperty('--fill')
    const page = view.dom.getBoundingClientRect(), least = parseFloat(getComputedStyle(view.dom).fontSize) * 12
    const boxes = all.map(element => {
      const rect = element.getBoundingClientRect(), style = getComputedStyle(element)
      return style.float === 'none' ? null : { element, left: style.float === 'left', top: rect.top, bottom: rect.bottom,
        from: rect.left - parseFloat(style.marginLeft), to: rect.right + parseFloat(style.marginRight),
        above: parseFloat(style.marginTop), below: parseFloat(style.marginBottom), fill: 0 }
    }).filter(Boolean)
    for (const box of boxes) {
      // The room between this object and whatever comes next on its open side,
      // sampled down its height: another object, or the edge of the page.
      let widest = 0, narrowest = Infinity
      for (const part of [.03, .25, .5, .75, .97]) {
        const y = box.top + (box.bottom - box.top) * part
        let edge = box.left ? page.right : page.left
        for (const other of boxes) {
          if (other === box || y < other.top - Math.max(0, other.above) || y > other.bottom + other.below) continue
          const from = other.from - (other.left ? 0 : other.fill), to = other.to + (other.left ? other.fill : 0)
          if (box.left ? from >= box.to - 1 : to <= box.from + 1) edge = box.left ? Math.min(edge, from) : Math.max(edge, to)
        }
        const width = box.left ? edge - box.to : box.from - edge
        widest = Math.max(widest, width)
        if (width > 1) narrowest = Math.min(narrowest, width)
      }
      // Claimed just short of all of it, so the object itself still fits its row.
      if (widest > 1 && widest < least && narrowest < Infinity) box.fill = Math.max(0, narrowest - .5)
    }
    for (const box of boxes) if (box.fill) box.element.style.setProperty('--fill', box.fill + 'px')
  })
}

// Stacked pages use document-order insertion. Desktop placement is handled by
// the independent canvas controller, never by a float-position search.
function landing(view, dom, stand, left, top, size) {
  const list=blocksAround(view,dom,stand)
  const before=list.find(element=>{const rect=element.getBoundingClientRect();return top<rect.top+rect.height/2})||null
  stand.className=dom.className.replace(/\b(is-moving|is-active|is-resizing|is-loading|ProseMirror-selectednode|fn-canvas-object)\b/g,'')
  Object.assign(stand.style,{width:size.width+'px',height:size.height+'px',boxSizing:'border-box',padding:'0',border:'0',visibility:'hidden'})
  applyPlacement(stand,unplaced)
  view.dom.insertBefore(stand,before)
  const rect=stand.getBoundingClientRect()
  return {before,placement:unplaced,others:[],box:{left:rect.left,top:rect.top,...size}}
}

// Apply a placement and keep the object selected for the next adjustment.
export function place({ view, getPos, placement, slot, rebuild }) {
  const { state } = view, pos = getPos()
  const node = typeof pos === 'number' ? state.doc.nodeAt(pos) : null
  if (!node) return false
  if(!slot&&alignCanvasObject(view,pos,placement.layout))return true
  const next = rebuild(node, placement, view.dom.clientWidth)
  const from = pos, to = pos + node.nodeSize
  const blockAt = element => { const $at = state.doc.resolve(view.posAtDOM(element, 0)); return $at.depth ? $at.before(1) : $at.pos }
  let target = from
  if (slot) {
    target = state.doc.content.size
    if (slot.before) {
      try { target = blockAt(slot.before) } catch { return false }
    }
  }
  try {
    const tr = closeHistory(state.tr)
    // Objects that had to give way stay where they are on the page: only the
    // numbers stored for them change. These steps move nothing, so the positions
    // worked out above still hold.
    for (const other of slot?.others || []) {
      try {
        const at = blockAt(other.element), current = state.doc.nodeAt(at)
        if (current && at !== from && 'layout' in current.attrs) tr.setNodeMarkup(at, null, { ...current.attrs, ...other.placement })
      } catch {}
    }
    let at = from
    if (target >= from && target <= to) tr.replaceWith(from, to, next)
    else { tr.delete(from, to); at = tr.mapping.map(target); tr.insert(at, next) }
    const after = at + next.nodeSize, following = tr.doc.resolve(after).nodeAfter
    // Always leave somewhere to type at the end of the note. Between two objects
    // no line is added: they may be meant to sit together.
    if (!following) tr.insert(after, state.schema.nodes.paragraph.create())
    // Keep the moved object selected for copy/cut and further adjustments.
    // Scrolling to the next paragraph can jump several screens in a dense note.
    tr.setSelection(NodeSelection.create(tr.doc, at))
    view.dispatch(tr)
    view.dispatch(closeHistory(view.state.tr))
    view.focus()
    return true
  } catch { return false }
}

// Turns `handle` into a move handle for the object rendered in `dom`.
// `widthFor(page)` is the width the object will have once placed.
// `ignore(target)` lets a handle that contains other controls leave their presses alone.
// `root` is the app's element for overlays (see createNotebook), where the drop
// outline is shown.
function createStackMover({ view, dom, handle, getPos, rebuild, widthFor, isEditable, onStart, onClick, preventDefault=false, ignore, root }) {
  const outline = document.createElement('div'), stand = document.createElement('div')
  outline.className = 'fn-place-ghost'
  let moving, dragged = false, clickTimer
  const reset = () => {
    stand.remove()
    for (const other of moving?.others || []) applyPlacement(other.element, other.was)
  }
  const settle = thorough => quietly(view, () => {
    if (!moving?.active || !dom.isConnected) return
    reset()
    const page = view.dom.getBoundingClientRect(), own = dom.getBoundingClientRect()
    const width = Math.min(page.width, page.width > 560 && widthFor ? widthFor(page.width) : own.width)
    const size = { width, height: own.height * (dom.classList.contains('fn-image') && own.width ? width / own.width : 1) }
    moving.slot = landing(view, dom, stand, moving.at.x - moving.dx, moving.at.y - moving.dy, size, moving.others, thorough)
    tidyChannels(view)
    // Channel cleanup can affect float geometry, so measure the final preview.
    const box = stand.getBoundingClientRect()
    Object.assign(outline.style, { left: box.left + 'px', top: box.top + 'px', width: box.width + 'px', height: box.height + 'px' })
  })
  const schedule = () => {
    if (!moving || moving.frame) return
    moving.frame = requestAnimationFrame(() => {
      if (!moving) return
      moving.frame = 0
      const scroller = view.dom.closest('.fn-note-content')
      let scrolled = false
      if (scroller) {
        const bounds = scroller.getBoundingClientRect(), y = moving.at.y
        const speed = y < bounds.top + 44 ? -Math.min(20, (bounds.top + 44 - y) / 2) : y > bounds.bottom - 44 ? Math.min(20, (y - bounds.bottom + 44) / 2) : 0
        const before = scroller.scrollTop
        if (speed) scroller.scrollTop += speed
        scrolled = before !== scroller.scrollTop
      }
      settle(false)
      // Continue scrolling while held at an edge, even without pointer movement.
      if (scrolled) schedule()
    })
  }
  const down = event => {
    if(!moving){dragged=false;clearTimeout(clickTimer)}
    if (moving || event.button || event.isPrimary === false || !isEditable() || ignore?.(event.target,event)) return
    const own = dom.getBoundingClientRect()
    moving = { pointer: event.pointerId, target:event.target, x: event.clientX, y: event.clientY, dx: event.clientX - own.left, dy: event.clientY - own.top, active: false }
    document.addEventListener('pointermove', move, true)
    document.addEventListener('pointerup', finish, true)
    document.addEventListener('pointercancel', finish, true)
    if(preventDefault)event.preventDefault()
  }
  const move = event => {
    if (!moving || event.pointerId !== moving.pointer) return
    if (!moving.active) {
      if (Math.hypot(event.clientX - moving.x, event.clientY - moving.y) < 5) return
      moving.active = true
      handle.setPointerCapture(event.pointerId)
      onStart?.()
      quietly(view, () => {
        const held = floating(dom) ? positions(view, [dom]) : null
        const own = dom.getBoundingClientRect()
        moving.restore = ['position', 'left', 'top', 'width', 'margin'].map(name => [name, dom.style.getPropertyValue(name)])
        Object.assign(dom.style, { width: own.width + 'px', margin: '0', position: 'fixed', left: '0', top: '0' })
        const origin = dom.getBoundingClientRect()
        moving.ox = origin.left; moving.oy = origin.top
        moving.others = held || positions(view, [dom])
        dom.classList.add('is-moving')
        ;(root || document.body).append(outline)
      })
    }
    event.preventDefault()
    dom.style.left = (event.clientX - moving.dx - moving.ox) + 'px'
    dom.style.top = (event.clientY - moving.dy - moving.oy) + 'px'
    moving.at = { x: event.clientX, y: event.clientY }
    schedule()
  }
  const finish = event => {
    if (!moving || event.pointerId !== undefined && event.pointerId !== moving.pointer) return
    const commit = event.type === 'pointerup' && isEditable()
    cancelAnimationFrame(moving.frame)
    if (moving.active && commit) {
      moving.at = { x: event.clientX, y: event.clientY }
      settle(true)
    }
    const done = moving
    document.removeEventListener('pointermove', move, true)
    document.removeEventListener('pointerup', finish, true)
    document.removeEventListener('pointercancel', finish, true)
    quietly(view, () => {
      reset()
      moving = undefined
      outline.remove()
      dom.classList.remove('is-moving')
      for (const [name, value] of done.restore || []) value ? dom.style.setProperty(name, value) : dom.style.removeProperty(name)
    })
    if (handle.hasPointerCapture?.(done.pointer)) handle.releasePointerCapture(done.pointer)
    if (!done.active) {if(commit)onClick?.(event,done.target);return}
    dragged = true
    clearTimeout(clickTimer)
    clickTimer = setTimeout(() => { dragged = false }, 200)
    if (commit && done.slot) place({ view, getPos, placement: done.slot.placement, slot: done.slot, rebuild })
    if (!view.isDestroyed) tidyChannels(view)
  }
  const key = event => {
    if (event.key !== 'Escape' || !moving) return
    event.preventDefault()
    finish({ type: 'cancel' })
  }
  handle.addEventListener('pointerdown', down)
  handle.addEventListener('lostpointercapture', finish)
  const click=event=>{if(dragged&&dom.contains(event.target)){event.preventDefault();event.stopPropagation()}}
  document.addEventListener('click',click,true)
  document.addEventListener('keydown', key, true)
  return { wasDragged: () => dragged, destroy: () => {
    if (moving) finish({ type: 'cancel' })
    clearTimeout(clickTimer)
    handle.removeEventListener('pointerdown', down)
    document.removeEventListener('pointermove', move, true)
    document.removeEventListener('pointerup', finish, true)
    document.removeEventListener('pointercancel', finish, true)
    handle.removeEventListener('lostpointercapture', finish)
    document.removeEventListener('click',click,true)
    document.removeEventListener('keydown', key, true)
    outline.remove(); stand.remove()
  } }
}

export function createMover(options) {
  const editable=options.isEditable
  const canvas=createCanvasMover({...options,isEditable:()=>editable()&&options.view.dom.clientWidth>560})
  const stack=createStackMover({...options,isEditable:()=>editable()&&options.view.dom.clientWidth<=560})
  return {wasDragged:()=>canvas.wasDragged()||stack.wasDragged(),destroy(){canvas.destroy();stack.destroy()}}
}
