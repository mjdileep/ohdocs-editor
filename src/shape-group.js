import { recognitionSamples, recognizeStrokes } from './shape-recognition.js'
import { shapeGroups } from './drawing-shapes.js'

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const connectors = new Set(shapeGroups.find(group => group.id === 'lines').tools.map(([id]) => id))
export const isPartialShape = tool => connectors.has(tool)
export const maxJoinDistance = 45

export function strokeBounds(points) {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity
  for (const [x, y] of points) {
    left = Math.min(left, x)
    right = Math.max(right, x)
    top = Math.min(top, y)
    bottom = Math.max(bottom, y)
  }
  return {left, right, top, bottom, span: Math.max(right - left, bottom - top)}
}

export function boxDistance(a, b) {
  return Math.hypot(Math.max(0, a.left - b.right, b.left - a.right),
    Math.max(0, a.top - b.bottom, b.top - a.bottom))
}

function distanceToPath(point, path) {
  let best = Infinity
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b[0] - a[0], dy = b[1] - a[1]
    const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx*dx + dy*dy || 1)))
    best = Math.min(best, Math.hypot(point[0] - a[0] - t*dx, point[1] - a[1] - t*dy))
  }
  return best
}

function connection(a, b) {
  const reach = Math.max(10, Math.min(maxJoinDistance, .2 * Math.max(a.box.span, b.box.span)))
  if (boxDistance(a.box, b.box) > reach) return Infinity
  const gap = Math.min(distanceToPath(a.points[0], b.points), distanceToPath(a.points.at(-1), b.points),
    distanceToPath(b.points[0], a.points), distanceToPath(b.points.at(-1), a.points))
  return gap <= reach ? gap / reach : Infinity
}

function unfinished(entry, current) {
  if (entry.points.length < 2 || entry.box.span < 6) return false
  const first = entry.points[0], last = entry.points.at(-1), gap = distance(first, last)
  if (gap > entry.box.span * .18) return true
  // A short finishing stroke can bridge a nearly closed loop. Leave a
  // previously completed sketch alone when drawing another shape beside it.
  return gap > 7 && Math.min(distanceToPath(first, current), distanceToPath(last, current)) < gap * .45
}

// Every trial contains the new stroke. Expand through touching ends, including
// T junctions, so opposite sides can be drawn first. Keep a few competing
// groups when another sketch touches the same corner.
export function matchPenGroup(current, nearby) {
  const solo = recognizeStrokes([current])
  const single = solo && {...solo, members: []}
  if (current.length < 2 || (solo && !solo.confirm && !solo.allowGroup && !isPartialShape(solo.tool))) return single
  const box = strokeBounds(current)
  if (box.span < 6) return single
  current = recognitionSamples(current)
  const candidates = nearby.filter(entry => unfinished(entry, current))
    .sort((a, b) => boxDistance(box, a.box) - boxDistance(box, b.box)).slice(0, 16)
  const entries = [{points: current, box}, ...candidates]
  const edges = entries.map(() => [])
  for (let i = 0; i < entries.length; i++) {
    for (let j = 0; j < i; j++) {
      const gap = connection(entries[i], entries[j])
      if (!Number.isFinite(gap)) continue
      edges[i].push([j, gap])
      edges[j].push([i, gap])
    }
  }

  let frontier = [{mask: 1, cost: 0}], best
  let bestRank = solo && !isPartialShape(solo.tool) ? solo.score : Infinity
  for (let size = 2; frontier.length && size <= entries.length; size++) {
    const next = new Map()
    for (const state of frontier) {
      for (let i = 0; i < entries.length; i++) {
        if (!(state.mask & (1 << i))) continue
        for (const [j, gap] of edges[i]) {
          if (state.mask & (1 << j)) continue
          const mask = state.mask | (1 << j), cost = state.cost + gap
          if (!next.has(mask) || cost < next.get(mask).cost) next.set(mask, {mask, cost})
        }
      }
    }
    frontier = [...next.values()].sort((a, b) => a.cost - b.cost).slice(0, 4)
    for (const state of frontier) {
      const members = candidates.filter((_, i) => state.mask & (1 << (i + 1)))
      const match = recognizeStrokes([current, ...members.map(entry => entry.points)])
      if (!match) continue
      const rank = match.score + (isPartialShape(match.tool) ? .11 : 0) + members.length * .002
      if (rank < bestRank) {
        bestRank = rank
        best = {...match, members}
      }
    }
    if (bestRank < .04) break
  }
  return best || single
}
