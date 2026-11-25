// Distances are CSS pixels, independent of document size. A slightly wider
// release radius keeps a captured line steady without making it hard to leave.
export const SNAP_DISTANCE = 6
export const RELEASE_DISTANCE = 11

export function alignmentTargets(references, pageWidth, pageHeight) {
  const targets = []
  for (const { id, kind = 'object', box } of references) {
    for (const axis of ['x', 'y']) {
      const size = axis === 'x' ? 'width' : 'height', cross = axis === 'x' ? 'y' : 'x'
      const crossSize = axis === 'x' ? 'height' : 'width'
      for (const factor of kind === 'text' ? [0, 1] : [0, .5, 1]) {
        targets.push({ id: `${id}:${axis}:${factor}`, reference: id, kind, axis, factor,
          mode: factor === .5 ? 'center' : 'edge', value: box[axis] + box[size] * factor,
          from: box[cross], to: box[cross] + box[crossSize] })
      }
    }
  }
  for (const factor of [0, .5, 1]) targets.push({ id: `page:x:${factor}`, kind: 'page', axis: 'x', factor,
    mode: factor === .5 ? 'center' : 'edge', value: pageWidth * factor, from: 0, to: pageHeight })
  targets.push({ id: 'page:y:0', kind: 'page', axis: 'y', factor: 0, mode: 'edge', value: 0, from: 0, to: pageWidth })
  return targets
}

export function snapAlignment(raw, targets, previous = {}, { pageWidth, disabled = false, excluded = new Set() } = {}) {
  const box = { ...raw }, locks = {}, matches = []
  if (disabled) return { box, locks, guides: [] }
  for (const axis of ['x', 'y']) {
    const size = axis === 'x' ? 'width' : 'height', cross = axis === 'x' ? 'y' : 'x'
    const crossSize = axis === 'x' ? 'height' : 'width'
    const maximum = axis === 'x' ? Math.max(0, pageWidth - raw.width) : 100000
    const candidate = (target, factor, distance) => {
      if (target.axis !== axis || excluded.has(target.id) || (factor === .5) !== (target.mode === 'center')) return null
      const coordinate = target.value - raw[size] * factor, delta = coordinate - raw[axis]
      if (coordinate < 0 || coordinate > maximum || Math.abs(delta) > distance) return null
      const separation = Math.max(0, target.from - (raw[cross] + raw[crossSize]), raw[cross] - target.to)
      return { target, factor, coordinate, distance: Math.abs(delta), separation }
    }
    const held = previous[axis], heldTarget = held && targets.find(target => target.id === held.id)
    let match = heldTarget && candidate(heldTarget, held.factor, RELEASE_DISTANCE)
    if (!match) {
      const candidates = []
      for (const target of targets) for (const factor of [0, .5, 1]) {
        const found = candidate(target, factor, SNAP_DISTANCE)
        if (found) candidates.push(found)
      }
      candidates.sort((a, b) => a.distance - b.distance ||
        (a.target.kind === 'page') - (b.target.kind === 'page') || a.separation - b.separation ||
        a.target.id.localeCompare(b.target.id) || a.factor - b.factor)
      match = candidates[0]
    }
    if (match) {
      box[axis] = match.coordinate
      locks[axis] = { id: match.target.id, factor: match.factor }
      matches.push(match)
    }
  }
  const guides = matches.map(({ target }) => {
    const cross = target.axis === 'x' ? 'y' : 'x', size = target.axis === 'x' ? 'height' : 'width'
    return { ...target, from: Math.min(target.from, box[cross]) - 8, to: Math.max(target.to, box[cross] + box[size]) + 8 }
  })
  return { box, locks, guides }
}
