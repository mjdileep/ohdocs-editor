import { NodeSelection } from '@tiptap/pm/state'
import { closeHistory } from '@tiptap/pm/history'

// Stacking order of objects placed on the page (canvas layout). Each object's
// `layer` is its z-index; objects with equal layers paint in document order, a
// later one on top. Restacking renumbers every placed object 1..n, so layers
// stay small and unique.
export const stackable = node => ['previewAttachment', 'table', 'codeBlock'].includes(node?.type?.name) && node.attrs.layout === 'canvas'

// Only objects that actually overlap change what anyone sees.
const overlap = (a, b) => !!a && !!b && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1

// Items are { pos, layer, rect }. Returns them bottom to top.
export const stackOrder = items => [...items].sort((a, b) => a.layer - b.layer || a.pos - b.pos)

// Which moves are worth offering for the object at `pos`.
export function stackingChoices(items, pos) {
  const order = stackOrder(items), index = order.findIndex(item => item.pos === pos)
  if (index < 0) return { forward: false, backward: false }
  const self = order[index]
  return {
    forward: order.slice(index + 1).some(other => overlap(self.rect, other.rect)),
    backward: order.slice(0, index).some(other => overlap(self.rect, other.rect)),
  }
}

// The new bottom-to-top order after `action` (front, forward, backward, back),
// or null when nothing would change. Forward and backward step past the next
// object that overlaps this one, so every step visibly changes something.
export function restackOrder(items, pos, action) {
  const order = stackOrder(items), index = order.findIndex(item => item.pos === pos)
  if (index < 0) return null
  const self = order[index], rest = order.filter(item => item !== self)
  let at
  if (action === 'front') at = rest.length
  else if (action === 'back') at = 0
  else if (action === 'forward') {
    const above = order.slice(index + 1).find(other => overlap(self.rect, other.rect))
    if (!above) return null
    at = rest.indexOf(above) + 1
  } else if (action === 'backward') {
    const below = order.slice(0, index).reverse().find(other => overlap(self.rect, other.rect))
    if (!below) return null
    at = rest.indexOf(below)
  } else return null
  rest.splice(at, 0, self)
  return rest.every((item, i) => item === order[i]) ? null : rest
}

// Placed objects in the editor, with where each one is drawn now.
export function canvasStack(view) {
  const items = []
  view.state.doc.forEach((node, pos) => {
    if (!stackable(node)) return
    items.push({ node, pos, layer: Number(node.attrs.layer) || 0, rect: view.nodeDOM(pos)?.getBoundingClientRect?.() })
  })
  return items
}

export const topLayer = view => Math.max(0, ...canvasStack(view).map(item => item.layer))

// Apply a stacking move to the object at `pos` as one undo step.
export function restack(view, pos, action) {
  if (!view.editable) return false
  const order = restackOrder(canvasStack(view), pos, action)
  if (!order) return false
  const selection = view.state.selection
  const tr = closeHistory(view.state.tr)
  order.forEach((item, index) => {
    if ((Number(item.node.attrs.layer) || 0) !== index + 1) tr.setNodeMarkup(item.pos, null, { ...item.node.attrs, layer: index + 1 })
  })
  // Keep whatever was selected: the object itself, or the caret inside a table or code block.
  tr.setSelection(selection instanceof NodeSelection ? NodeSelection.create(tr.doc, selection.from) : selection.map(tr.doc, tr.mapping))
  view.dispatch(tr)
  view.dispatch(closeHistory(view.state.tr))
  return true
}
