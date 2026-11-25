import { closeHistory } from '@tiptap/pm/history'
import { quietly, tidyChannels } from './placement.js'
import { beginCanvasGesture } from './canvas-flow.js'

// One resize is one undo step. Preview only touches DOM; cancellation restores
// every previewed style, including on Escape, lost capture or view teardown.
export function createObjectResizer({ view, dom, handles, getPos, isEditable, begin, preview, commit }) {
  let active, suppressClick, frame = 0
  const draw = () => {
    frame = 0
    if (!active) return
    quietly(view, () => preview(active.data, active.dx, active.dy, active.axis, active))
    if(active.canvas){
      const rect=dom.getBoundingClientRect()
      active.canvas.target.box={x:rect.left-active.canvas.page.left,y:rect.top-active.canvas.page.top,width:rect.width,height:rect.height}
      active.canvas.draw()
    }else tidyChannels(view)
  }
  const start = (handle, pointer, x, y) => {
    if (active || !isEditable()) return false
    const axis = handle.dataset.resizeAxis, data = begin(axis, {x,y})
    if (!data) return false
    const pos = getPos?.(), doc = view.state.doc
    const canvas = typeof pos === 'number' && !doc.nodeAt(pos)?.attrs.documentFlow ? beginCanvasGesture(view,pos) : null
    active = { data, handle, axis, doc, canvas, pointer, x, y, dx: 0, dy: 0,
      rotation: dom.getAttribute('data-media-rotation'), ratio: dom.getAttribute('data-frame-ratio'), sized: dom.classList.contains('is-sized'),
      styles: [dom, ...dom.querySelectorAll('table,col')].map(element => [element, element.getAttribute('style')]) }
    dom.classList.add('is-resizing')
    return true
  }
  const down = event => {
    if (event.button || event.isPrimary === false || !start(event.currentTarget,event.pointerId,event.clientX,event.clientY)) return
    suppressClick = null
    event.preventDefault()
    // Keep the rotation grip available between gestures, including over the
    // transparent centre of an ink object where there is no hover target.
    if (active.axis === 'rotate') event.currentTarget.focus({preventScroll:true})
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const delta = event => {
    const dx = event.clientX-active.x, dy = event.clientY-active.y
    const axes = active.pointer !== null && active.axis !== 'rotate' && active.data.axes
    active.dx = active.axis === 'height' ? 0 : axes ? dx*axes.cos+dy*axes.sin : dx
    active.dy = active.axis === 'width' ? 0 : axes ? -dx*axes.sin+dy*axes.cos : dy
    active.shift = event.shiftKey
    if (Math.hypot(dx,dy) >= 3) active.dragged = true
  }
  const move = event => {
    if (!active || event.pointerId !== active.pointer) return
    event.preventDefault()
    delta(event)
    if (!frame) frame = requestAnimationFrame(draw)
  }
  const finish = event => {
    if (!active || event.pointerId !== undefined && event.pointerId !== active.pointer) return
    cancelAnimationFrame(frame); frame = 0
    const save = event.type === 'pointerup' && !view.isDestroyed && view.state.doc === active.doc && isEditable()
    if (save) {
      delta(event)
      draw()
    }
    const done = active
    active = undefined
    quietly(view, () => {
      for (const [element, style] of done.styles) style === null ? element.removeAttribute('style') : element.setAttribute('style', style)
      if (done.data.media) {
        if (done.ratio === null) dom.removeAttribute('data-frame-ratio')
        else dom.setAttribute('data-frame-ratio',done.ratio)
        if (done.rotation === null) dom.removeAttribute('data-media-rotation')
        else dom.setAttribute('data-media-rotation',done.rotation)
      }
      dom.classList.remove('is-resizing')
      dom.classList.toggle('is-sized', done.sized)
    })
    if (done.pointer !== null && done.handle.hasPointerCapture?.(done.pointer)) done.handle.releasePointerCapture(done.pointer)
    const moved = done.axis === 'rotate' && done.pointer !== null
      ? done.dragged : Math.abs(done.dx) >= 1 || Math.abs(done.dy) >= 1
    // WebKit can send a click back to the original button even after Escape
    // released capture and the pointer came up on another element.
    if (done.axis === 'rotate' && done.pointer !== null && (!save || moved)) suppressClick = done.handle
    if (save && moved) {
      if(done.canvas)done.canvas.commit(tr=>commit(done.data,tr))
      else {
        view.dispatch(closeHistory(view.state.tr))
        commit(done.data)
        view.dispatch(closeHistory(view.state.tr))
      }
    }else done.canvas?.restore()
    if (done.axis === 'rotate' && done.handle.isConnected && !view.isDestroyed) done.handle.focus({preventScroll:true})
    if (!view.isDestroyed) tidyChannels(view)
  }
  const key = event => {
    if (event.key !== 'Escape' || !active) return
    event.preventDefault()
    event.stopPropagation()
    finish({ type: 'cancel' })
  }
  const arrows = { ArrowLeft: [-1,0], ArrowRight: [1,0], ArrowUp: [0,-1], ArrowDown: [0,1] }
  const adjust = event => {
    const direction = arrows[event.key], handle = event.currentTarget
    if (!direction || event.altKey || event.metaKey || event.ctrlKey) return
    const [dx,dy] = direction, axis = handle.dataset.resizeAxis
    if (axis === 'width' && !dx || axis === 'height' && !dy || !start(handle,null,0,0)) return
    event.preventDefault()
    event.stopPropagation()
    const step = event.shiftKey ? (axis === 'rotate' ? 15 : 10) : 1
    finish({type:'pointerup', clientX:dx*step, clientY:dy*step, shiftKey:event.shiftKey})
    handle.focus({preventScroll:true})
  }
  const click = event => {
    if (suppressClick !== event.currentTarget || !event.detail) return
    suppressClick = null
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  for (const handle of handles) handle.addEventListener('click',click,true)
  const events = { keydown: adjust, pointerdown: down, pointermove: move, pointerup: finish, pointercancel: finish, lostpointercapture: finish }
  for (const handle of handles) for (const [name, listener] of Object.entries(events)) handle.addEventListener(name, listener)
  document.addEventListener('keydown', key, true)
  return { destroy() {
    if (active) finish({ type: 'cancel' })
    for (const handle of handles) handle.removeEventListener('click',click,true)
    for (const handle of handles) for (const [name, listener] of Object.entries(events)) handle.removeEventListener(name, listener)
    document.removeEventListener('keydown', key, true)
  } }
}

// A corner grip follows either axis while the picture keeps its aspect ratio.
export function imageResizeWidth(width, height, dx, dy, maximum, minimum = 40) {
  const ratio = width / Math.max(1, height)
  // On a very thin stroke, a pixel of sideways jitter can otherwise
  // turn into hundreds of pixels along its long axis.
  let delta = Math.abs(dx) >= Math.abs(dy * ratio) ? dx : dy * ratio
  if (ratio > 5) delta = dx
  if (ratio < .2) delta = dy * ratio
  return Math.round(Math.max(Math.min(minimum, maximum), Math.min(maximum, width + delta)))
}

export function resizeHandles(dom, label, icon, proportional = false) {
  return ['corner', 'width', 'height'].map(axis => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = axis === 'corner' ? 'fn-object-resize' : 'fn-resize-edge'
    button.dataset.resizeAxis = axis
    button.contentEditable = 'false'
    const action = axis === 'corner' ? 'Resize ' + label : 'Adjust ' + label + ' ' + axis
    button.setAttribute('aria-label', action)
    button.title = action + (axis === 'corner' && proportional ? ' proportionally' : '') +
      (proportional && axis !== 'corner' ? '. Double-click for original proportions.' : '. Double-click to reset.') + ' Arrow keys adjust. Shift for 10 px.'
    if (axis === 'corner') button.innerHTML = icon?.('move-diagonal-2') || '↘'
    dom.append(button)
    return button
  })
}

export const resizeLength = (value, minimum, maximum = 10000) =>
  Math.min(maximum, Math.max(minimum, Math.round(value)))

// A side changes just that dimension. Keep thin ink strokes at their original
// thickness on the untouched axis, even when they are smaller than a grip.
export function visualSize(rect, axis, dx, dy, maximum, minimum = 40, minHeight = 12) {
  if (axis === 'corner') {
    const ratio = rect.width / rect.height
    const lower = Math.min(rect.width, Math.max(minimum, minHeight * ratio))
    const upper = Math.min(maximum, Math.max(rect.width, 10000 * ratio))
    const width = imageResizeWidth(rect.width, rect.height, dx, dy, upper, lower)
    return { width, height: rect.height * width / rect.width }
  }
  return {
    width: axis === 'width' ? resizeLength(rect.width + dx, Math.min(minimum, rect.width), maximum) : rect.width,
    height: axis === 'height' ? resizeLength(rect.height + dy, Math.min(minHeight,rect.height)) : rect.height,
  }
}

export function fittedWidth(dom) {
  const previous = dom.style.width
  dom.style.width = 'fit-content'
  const width = dom.getBoundingClientRect().width
  dom.style.width = previous
  return width
}
