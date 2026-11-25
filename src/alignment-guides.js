import { alignmentTargets, snapAlignment } from './alignment.js'

function textBox(dom, page) {
  if (!dom?.isConnected || !dom.textContent.trim()) return null
  const range = document.createRange()
  range.selectNodeContents(dom)
  const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0)
  if (!rects.length) return null
  const left = Math.min(...rects.map(rect => rect.left)), top = Math.min(...rects.map(rect => rect.top))
  return { x: left - page.left, y: top - page.top,
    width: Math.max(...rects.map(rect => rect.right)) - left, height: Math.max(...rects.map(rect => rect.bottom)) - top }
}

// `root` is the app's element for overlays (see createNotebook); without one the
// guides go next to the editor.
export function createDragAlignment(view, session, root) {
  const references = session.items.filter(item => item !== session.target).map(item => ({ id: `object:${item.pos}`, box: item.box }))
  const text = new Map(), excluded = new Set()
  // Snapshot complete text groups, never individual words. Reflowing references
  // are retired for this gesture rather than attracting their own wrapping object.
  view.state.doc.forEach((node, pos) => {
    if (!node.textContent.trim() || session.items.some(item => item.pos === pos)) return
    const dom = view.nodeDOM(pos)
    if (!(dom instanceof HTMLElement) || dom.querySelector('.fn-attachment,.fn-table')) return
    const bounds = dom.getBoundingClientRect()
    if (bounds.bottom < 0 || bounds.top > innerHeight) return
    const box = textBox(dom, session.page)
    if (!box || box.width < 32) return
    const id = `text:${pos}`
    text.set(id, dom)
    references.push({ id, kind: 'text', box })
  })
  const targets = alignmentTargets(references, session.page.width, session.page.height)
  const ns = 'http://www.w3.org/2000/svg', overlay = document.createElementNS(ns, 'svg')
  overlay.classList.add('fn-alignment-guides')
  overlay.setAttribute('aria-hidden', 'true')
  overlay.setAttribute('focusable', 'false')
  overlay.setAttribute('hidden', '')
  const lines = Array.from({ length: 2 }, () => {
    const line = document.createElementNS(ns, 'line')
    overlay.append(line)
    return line
  })
  ;(root || view.dom.parentElement).append(overlay)
  let locks = {}
  return {
    snap(raw, page, disabled) {
      let result
      for (let attempt = 0; attempt < 4; attempt++) {
        result = snapAlignment(raw, targets, locks, { pageWidth: page.width, disabled, excluded })
        const unstable = result.guides.filter(guide => {
          if (guide.kind !== 'text') return false
          const box = textBox(text.get(guide.reference), page)
          const size = guide.axis === 'x' ? 'width' : 'height'
          return !box || Math.abs(box[guide.axis] + box[size] * guide.factor - guide.value) > 1
        })
        if (!unstable.length) { locks = result.locks; return result }
        for (const guide of unstable) excluded.add(guide.id)
      }
      // Dense reflow can invalidate several nearby text edges at once. Keep the
      // stable object/page guides without doing an unbounded layout search.
      result = snapAlignment(raw, targets.filter(target => target.kind !== 'text'), locks, { pageWidth: page.width, disabled, excluded })
      locks = result.locks
      return result
    },
    paint(guides, page) {
      overlay.toggleAttribute('hidden', !guides.length)
      if (!guides.length) return
      const scroller = view.dom.closest('.fn-note-content')?.getBoundingClientRect()
      const left = Math.max(0, page.left, scroller?.left || 0), top = Math.max(0, page.top, scroller?.top || 0)
      const right = Math.min(innerWidth, page.right, scroller?.right ?? innerWidth)
      const bottom = Math.min(innerHeight, scroller?.bottom ?? innerHeight)
      Object.assign(overlay.style, { left: left + 'px', top: top + 'px', width: Math.max(0, right - left) + 'px', height: Math.max(0, bottom - top) + 'px' })
      lines.forEach((line, index) => {
        const guide = guides[index]
        line.style.display = guide ? '' : 'none'
        if (!guide) return
        const vertical = guide.axis === 'x'
        const x1 = page.left - left + (vertical ? guide.value : guide.from)
        const y1 = page.top - top + (vertical ? guide.from : guide.value)
        for (const [name, value] of Object.entries({ x1, y1,
          x2: vertical ? x1 : page.left - left + guide.to,
          y2: vertical ? page.top - top + guide.to : y1 })) line.setAttribute(name, String(value))
        line.dataset.axis = guide.axis
        line.dataset.kind = guide.kind
        line.dataset.mode = guide.mode
      })
    },
    destroy() { overlay.remove() },
  }
}
