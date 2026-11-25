import test from 'node:test'
import assert from 'node:assert/strict'
import { stackOrder, stackingChoices, restackOrder, stackable } from './object-stacking.js'

const box = (left, top, width = 100, height = 100) => ({ left, top, right: left + width, bottom: top + height })
// a sits under b and c; b and c overlap a but not each other; far overlaps nothing.
const items = [
  { pos: 1, layer: 1, rect: box(0, 0) },
  { pos: 5, layer: 2, rect: box(60, 60) },
  { pos: 9, layer: 3, rect: box(-60, 60) },
  { pos: 13, layer: 4, rect: box(500, 500) },
]
const positions = order => order?.map(item => item.pos)

test('objects stack by layer, and equal layers by document order', () => {
  assert.deepEqual(positions(stackOrder([{ pos: 9, layer: 2 }, { pos: 3, layer: 2 }, { pos: 5, layer: 1 }])), [5, 3, 9])
})

test('only moves that change what is seen are offered', () => {
  assert.deepEqual(stackingChoices(items, 1), { forward: true, backward: false })
  assert.deepEqual(stackingChoices(items, 9), { forward: false, backward: true })
  assert.deepEqual(stackingChoices(items, 13), { forward: false, backward: false }, 'an object overlapping nothing has no stacking choices')
  assert.deepEqual(stackingChoices(items, 99), { forward: false, backward: false })
})

test('forward and backward step past the next overlapping object; front and back go all the way', () => {
  assert.deepEqual(positions(restackOrder(items, 1, 'forward')), [5, 1, 9, 13])
  assert.deepEqual(positions(restackOrder(items, 9, 'backward')), [9, 1, 5, 13], 'skips b, which it does not overlap, to go under a')
  assert.deepEqual(positions(restackOrder(items, 1, 'front')), [5, 9, 13, 1])
  assert.deepEqual(positions(restackOrder(items, 9, 'back')), [9, 1, 5, 13])
})

test('a move that would change nothing is refused', () => {
  assert.equal(restackOrder(items, 1, 'back'), null)
  assert.equal(restackOrder(items, 13, 'front'), null)
  assert.equal(restackOrder(items, 13, 'forward'), null)
  assert.equal(restackOrder(items, 1, 'sideways'), null)
})

test('only objects placed on the page are stackable', () => {
  const node = (name, layout) => ({ type: { name }, attrs: { layout } })
  assert.equal(stackable(node('previewAttachment', 'canvas')), true)
  assert.equal(stackable(node('table', 'canvas')), true)
  assert.equal(stackable(node('previewAttachment', null)), false)
  assert.equal(stackable(node('paragraph', 'canvas')), false)
  assert.equal(stackable(null), false)
})
