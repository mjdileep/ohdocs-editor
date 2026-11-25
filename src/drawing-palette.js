import { icon } from './icons.js'
import { shapeGroups, shapeIcon, shapeHint } from './drawing-shapes.js'
import { isMacPlatform } from './editor-shortcuts.js'

let sequence = 0
const optionName = tool => shapeGroups.flatMap(group => group.tools).find(([id]) => id === tool)
const title = ([tool, name, key]) => `${name}${key ? ` (${key})` : ''}. ${shapeHint(tool, isMacPlatform() ? 'Option' : 'Alt')}`

export function drawingGroupButtons(choices = {}) {
  return shapeGroups.map(group => {
    const choice = group.tools.find(([id]) => id === choices[group.id]) || group.tools[0]
    return `<span class="fn-draw-group" data-shape-group="${group.id}"><button type="button" class="fn-icon" data-tool="${choice[0]}" title="${title(choice)}" aria-label="${choice[1]}" aria-pressed="false"${choice[2] ? ` aria-keyshortcuts="${choice[2]}"` : ''}>${shapeIcon(choice[0])}</button><button type="button" class="fn-icon fn-draw-expand" data-draw-group="${group.id}" title="${group.label}" aria-label="${group.label}" aria-haspopup="menu" aria-expanded="false">${icon('chevron-down')}</button></span>`
  }).join('')
}

// A split button keeps the last-used tool one click away; its menu stays small
// even as the catalogue grows. The geometry supplies the thumbnail and the ink.
export function drawingPalette({ toolbar, root, choices, onChoose }) {
  let menu, trigger, group, selected
  const close = (restoreFocus = false) => {
    menu?.remove(); menu = null
    trigger?.setAttribute('aria-expanded', 'false')
    trigger?.removeAttribute('aria-controls')
    if (restoreFocus) trigger?.focus({ preventScroll: true })
    trigger = null; group = null
  }
  const position = () => {
    if (!menu) return
    const rect = trigger.getBoundingClientRect(), bounds = menu.getBoundingClientRect()
    const left = Math.max(8, Math.min(innerWidth - bounds.width - 8, rect.right - bounds.width))
    const above = rect.top - bounds.height - 10
    Object.assign(menu.style, { left: `${left}px`, top: `${Math.max(8, above >= 8 ? above : Math.min(rect.bottom + 10, innerHeight - bounds.height - 8))}px` })
  }
  const caption = button => {
    const choice = optionName(button.dataset.shape)
    menu.querySelector('.fn-draw-caption').textContent = choice[1]
    menu.querySelector('kbd').textContent = choice[2] || ''
  }
  const open = button => {
    if (trigger === button) { close(true); return }
    close()
    trigger = button; group = shapeGroups.find(item => item.id === button.dataset.drawGroup)
    if (!group) return
    menu = document.createElement('div')
    menu.className = 'fn-draw-tools fn-draw-menu'; menu.id = `fn-shapes-${++sequence}`
    menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', group.label)
    menu.innerHTML = `<div class="fn-draw-grid" role="presentation">${group.tools.map(([id, name, key]) => `<button type="button" class="fn-icon" role="menuitemradio" data-shape="${id}" aria-label="${name}" aria-checked="${id === selected}" title="${title([id, name, key])}" tabindex="-1"${key ? ` aria-keyshortcuts="${key}"` : ''}>${shapeIcon(id)}</button>`).join('')}</div><div class="fn-draw-caption-row" aria-hidden="true"><span class="fn-draw-caption"></span><kbd></kbd></div>`
    trigger.setAttribute('aria-expanded', 'true'); trigger.setAttribute('aria-controls', menu.id)
    root.append(menu); position()
    const initial = menu.querySelector(`[data-shape="${choices[group.id] || group.tools[0][0]}"]`)
    initial.tabIndex = 0; caption(initial); initial.focus({ preventScroll: true })
    menu.onmousedown = event => { if (event.target.closest('button')) event.preventDefault() }
    menu.onpointerover = event => { const item = event.target.closest('[data-shape]'); if (item) caption(item) }
    menu.addEventListener('focusin', event => { if (event.target.matches('[data-shape]')) caption(event.target) })
    menu.onclick = event => {
      const item = event.target.closest('[data-shape]')
      if (item) { const tool = item.dataset.shape; close(); onChoose(tool) }
    }
  }
  const select = tool => {
    selected = tool
    const family = shapeGroups.find(item => item.tools.some(([id]) => id === tool))
    if (family) {
      choices[family.id] = tool
      const button = toolbar.querySelector(`[data-shape-group="${family.id}"] [data-tool]`), choice = optionName(tool)
      button.dataset.tool = tool; button.innerHTML = shapeIcon(tool)
      button.title = title(choice); button.setAttribute('aria-label', choice[1])
      if (choice[2]) button.setAttribute('aria-keyshortcuts', choice[2])
      else button.removeAttribute('aria-keyshortcuts')
    }
    close()
  }
  const key = event => {
    if (!menu) return false
    if (event.key === 'Tab') { close(true); return false }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return true }
    if (!menu.contains(event.target) || event.altKey || event.metaKey || event.ctrlKey) return false
    const items = [...menu.querySelectorAll('[data-shape]')], index = items.indexOf(document.activeElement)
    const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }
    let next
    if (event.key in steps) next = (index + steps[event.key] + items.length) % items.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = items.length - 1
    else return false
    event.preventDefault(); event.stopPropagation()
    items.forEach((item, i) => { item.tabIndex = i === next ? 0 : -1 })
    items[next].focus({ preventScroll: true }); return true
  }
  const outside = event => { if (menu && !menu.contains(event.target) && !toolbar.contains(event.target)) close() }
  document.addEventListener('pointerdown', outside, true)
  window.addEventListener('resize', position)
  return { open, close, select, key, get isOpen() { return !!menu }, destroy() { close(); document.removeEventListener('pointerdown', outside, true); window.removeEventListener('resize', position) } }
}
