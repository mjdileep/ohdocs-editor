import test from 'node:test'
import assert from 'node:assert/strict'
import { alignmentTargets, snapAlignment } from './alignment.js'

const reference = { id: 'picture', box: { x: 300, y: 200, width: 120, height: 80 } }
const targets = alignmentTargets([reference], 800, 1000)
const raw = { x: 296, y: 197, width: 80, height: 40 }
const snap = (box, previous, options = {}) => snapAlignment(box, targets, previous, { pageWidth: 800, ...options })

test('objects align on both axes with guides spanning both rectangles', () => {
  const result = snap(raw)
  assert.equal(result.box.x, 300)
  assert.equal(result.box.y, 200)
  assert.deepEqual(result.guides.map(g => [g.axis, g.value, g.from, g.to]), [['x', 300, 192, 288], ['y', 200, 292, 428]])
  assert.equal(raw.x, 296, 'the pointer geometry remains independent of the snapped preview')
})

test('small pointer noise stays captured and a deliberate pull releases it', () => {
  const acquired = snap(raw)
  assert.equal(snap({ ...raw, x: 309 }, acquired.locks).box.x, 300)
  const released = snap({ ...raw, x: 312 }, acquired.locks)
  assert.equal(released.box.x, 312)
  assert.equal(released.locks.x, undefined)
  assert.equal(snap({ ...raw, x: 307 }, released.locks).box.x, 307, 'recapture requires entering the smaller radius')
  assert.equal(snap({ ...raw, x: 305 }, released.locks).box.x, 300)
})

test('centers align with centers, and opposite edges can meet', () => {
  assert.equal(snap({ ...raw, x: 323, y: 400 }).box.x, 320)
  assert.equal(snap({ ...raw, x: 223, y: 400 }).box.x, 220)
  assert.equal(snap({ ...raw, x: 260, y: 400 }).box.x, 260, 'an object center is not pulled onto another object edge')
})

test('Alt/Option bypass removes both capture and guides without moving the raw position', () => {
  const result = snap(raw, snap(raw).locks, { disabled: true })
  assert.deepEqual(result.box, raw)
  assert.deepEqual(result.locks, {})
  assert.deepEqual(result.guides, [])
})

test('text group edges and page margins participate without individual word magnets', () => {
  const text = alignmentTargets([{ id: 'paragraph', kind: 'text', box: { x: 100, y: 350, width: 250, height: 70 } }], 800, 1000)
  const result = snapAlignment({ x: 104, y: 347, width: 80, height: 40 }, text, {}, { pageWidth: 800 })
  assert.deepEqual([result.box.x, result.box.y], [100, 350])
  assert.ok(result.guides.every(g => g.kind === 'text'))
  assert.equal(text.filter(t => t.kind === 'text').length, 4)
  assert.equal(snap({ ...raw, x: 717, y: 400 }).box.x, 720)
  assert.equal(snap({ ...raw, x: 357, y: 400 }).box.x, 360, 'page and object centers share an alignment')
})

test('reflowed text references can be excluded without chasing the text', () => {
  const acquired = snap(raw)
  const result = snap(raw, acquired.locks, { excluded: new Set(['picture:x:0', 'picture:y:0']) })
  assert.deepEqual(result.box, raw)
  assert.deepEqual(result.guides, [])
})

test('snaps cannot take objects outside the page and preserve size', () => {
  const outside = alignmentTargets([{ id: 'outside', box: { x: -3, y: -2, width: 30, height: 30 } }], 800, 1000)
  for (const position of [{ x: 0, y: 0 }, { x: 720, y: 100 }, { x: 365, y: 197 }]) {
    const result = snapAlignment({ ...raw, ...position }, outside, {}, { pageWidth: 800 })
    assert.ok(result.box.x >= 0 && result.box.x <= 720 && result.box.y >= 0)
    assert.equal(result.box.width, raw.width)
    assert.equal(result.box.height, raw.height)
  }
})
