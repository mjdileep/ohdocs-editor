import { shapeName } from './drawing-shapes.js'
import { icon } from './icons.js'
import { isPartialShape } from './shape-group.js'

export function shapeSuggestion(toolbar, canvas, paper) {
  const bar = document.createElement('div')
  bar.className = 'fn-shape-suggestion'
  bar.hidden = true
  bar.setAttribute('role', 'group')
  bar.setAttribute('aria-label', 'Shape suggestion')
  const announce = document.createElement('span')
  announce.className = 'fn-recognition-status'
  announce.setAttribute('role', 'status')
  toolbar.prepend(announce, bar)
  let action, anchor
  function position() {
    if (bar.hidden) return
    // Incomplete connectors stay by the toolbar so the next side can start
    // freely. For a completed outline, put the choice just outside the ink.
    bar.style.left = bar.style.top = bar.style.bottom = ''
    if (!anchor) return
    const page = paper.getBoundingClientRect(), visible = canvas.getBoundingClientRect()
    const dock = toolbar.getBoundingClientRect(), menu = bar.getBoundingClientRect()
    const top = page.top + anchor.top, bottom = page.top + anchor.bottom
    if (bottom < visible.top || top > visible.bottom || menu.width + 12 > visible.width) return
    const above = top - 10 - menu.height, below = bottom + 10
    const minY = visible.top + 4, maxY = Math.min(visible.bottom,dock.top) - menu.height - 4
    if (maxY < minY) return
    const y = above >= minY ? above : Math.min(below,maxY)
    let left = page.left + anchor.center - menu.width / 2
    if (above < minY && below > maxY) left = page.left + anchor.right + 8
    const x = Math.max(visible.left + 6, Math.min(visible.right - menu.width - 6,left))
    bar.style.left = (x - dock.left - toolbar.clientLeft) + 'px'
    bar.style.top = (y - dock.top - toolbar.clientTop) + 'px'
    bar.style.bottom = 'auto'
  }
  const hide = () => {
    if (bar.hidden) return
    if (bar.contains(document.activeElement)) canvas.focus({preventScroll: true})
    bar.hidden = true
    anchor = null
    announce.textContent = ''
    action = null
  }
  const apply = choice => {
    const run = action
    hide()
    run?.(choice)
    canvas.focus({preventScroll: true})
  }
  bar.onclick = event => {
    // The drawing toolbar has its own delegated button handler.
    event.stopPropagation()
    if (event.target.closest('[data-use-shape]')) apply()
    else if (event.target.closest('button')) { hide(); canvas.focus({preventScroll: true}) }
  }
  return {
    hide, position,
    show(match, converted, run, alternatives = [], changeOnly = false) {
      anchor = null
      const name = match.label || shapeName(match.tool)
      const label = converted ? 'Restore sketch' : match.tool === 'outline' ? 'Smooth outline' : 'Use ' + name.toLowerCase()
      const dismiss = converted ? 'Keep shape' : 'Keep sketch'
      bar.innerHTML = '<button type="button" data-use-shape></button><button type="button" class="fn-icon"></button>'
      const [accept, keep] = bar.children
      if (converted) accept.innerHTML = icon('undo-2')
      else {
        // Show the actual fit, including its orientation and number of points.
        const xs = match.points.map(p=>p[0]), ys = match.points.map(p=>p[1])
        const w = Math.max(...xs)-Math.min(...xs), h = Math.max(...ys)-Math.min(...ys)
        const scale = 18/Math.max(w,h,1), cx = Math.min(...xs)+w/2, cy = Math.min(...ys)+h/2
        const d = match.points.map(([x,y],i)=> (i?'L':'M')+(12+(x-cx)*scale).toFixed(2)+' '+(12+(y-cy)*scale).toFixed(2)).join(' ')
        accept.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round" stroke-linecap="round" d="'+d+'"/></svg>'
      }
      accept.append(document.createTextNode(label))
      accept.title = label + ' (Enter)'
      if (converted) keep.innerHTML = icon('check')
      else {
        keep.className = 'fn-keep-sketch'
        keep.textContent = dismiss
      }
      if (alternatives.length) {
        const select = document.createElement('select')
        select.className = 'fn-shape-alternatives'
        select.setAttribute('aria-label','Change shape')
        select.title = 'Change shape'
        const placeholder = new Option('Change shape…','',true,true)
        placeholder.disabled = true
        select.add(placeholder)
        alternatives.forEach((choice,i)=>select.add(new Option(shapeName(choice.tool),String(i))))
        select.onchange = () => { if (select.value !== '') apply(alternatives[Number(select.value)]) }
        bar.insertBefore(select,keep)
        if (changeOnly) {
          accept.hidden = true
          select.classList.add('fn-change-shape')
          keep.textContent = 'Done'
        }
      }
      keep.setAttribute('aria-label', changeOnly ? 'Done' : dismiss)
      keep.title = (changeOnly ? 'Done' : dismiss) + ' (Esc)'
      const count = match.members.length + 1
      const source = count > 1 ? ' from ' + count + ' strokes' : ''
      announce.textContent = converted ? name + ' applied' + source + '. Restore sketch available.' : name + ' suggested' + source + '. Enter to use it, or keep drawing.'
      if (!isPartialShape(match.tool)) {
        const xs = match.points.map(p => p[0]), ys = match.points.map(p => p[1])
        anchor = {center:(Math.min(...xs)+Math.max(...xs))/2, right:Math.max(...xs), top:Math.min(...ys), bottom:Math.max(...ys)}
      }
      if (changeOnly) announce.textContent = 'Choose a replacement shape.'
      action = run
      bar.hidden = false
      position()
    },
    key(event) {
      if (!action || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false
      if (event.key === 'Escape') hide()
      else if (event.key === 'Enter' && event.target === canvas) {
        if (bar.querySelector('[data-use-shape]').hidden) bar.querySelector('select').focus()
        else apply()
      }
      else return false
      event.preventDefault()
      event.stopPropagation()
      return true
    },
  }
}
