import test from 'node:test'
import assert from 'node:assert/strict'
import { shapePoints, shapeIsTiny, isShapeTool, shapeGroups, shapeTools, shapeName, shapeIcon } from './drawing-shapes.js'
import { makeStroke, drawingData, drawingSVG, hitsStroke } from '../format/drawing.mjs'

const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-6, `${message}: ${a} vs ${b}`)

test('a line runs from press to release, and Shift snaps it to 45° steps keeping its length', () => {
  assert.deepEqual(shapePoints('line', [10, 10], [60, 22]), [[10, 10], [60, 22]])
  const [, end] = shapePoints('line', [0, 0], [100, 10], { shift: true })
  close(end[1], 0, 'nearly level becomes level'); close(end[0], Math.hypot(100, 10), 'length kept')
  const [, diagonal] = shapePoints('line', [0, 0], [50, 55], { shift: true })
  close(diagonal[0], diagonal[1], 'nearly diagonal becomes 45°')
})

test('an arrow is one stroke: shaft, then both barbs from the tip, sized by the stroke', () => {
  const points = shapePoints('arrow', [0, 50], [200, 50], { size: 4 })
  assert.equal(points.length, 5)
  assert.deepEqual(points[1], [200, 50]); assert.deepEqual(points[3], [200, 50])
  close(points[2][0], points[4][0], 'barbs mirror each other'); close(points[2][1] - 50, 50 - points[4][1], 'barbs mirror each other')
  close(Math.hypot(200 - points[2][0], 50 - points[2][1]), 14, 'head grows with a thicker stroke')
  const short = shapePoints('arrow', [0, 0], [10, 0], { size: 4 })
  assert.ok(Math.hypot(10 - short[2][0], short[2][1]) <= 4.5 + 1e-9, 'the head never outgrows a short shaft')
})

test('boxes: rectangles close, Shift makes squares, Alt grows from the centre, diamonds touch each side', () => {
  assert.deepEqual(shapePoints('rectangle', [50, 40], [10, 10]), [[10, 10], [50, 10], [50, 40], [10, 40], [10, 10]])
  const square = shapePoints('rectangle', [0, 0], [30, 10], { shift: true })
  assert.deepEqual(square[2], [30, 30])
  const centred = shapePoints('rectangle', [100, 100], [120, 110], { alt: true })
  assert.deepEqual(centred[0], [80, 90]); assert.deepEqual(centred[2], [120, 110])
  assert.deepEqual(shapePoints('diamond', [0, 0], [40, 20]), [[20, 0], [40, 10], [20, 20], [0, 10], [20, 0]])
})

test('an ellipse is a closed, smooth outline with a bounded number of points', () => {
  const small = shapePoints('ellipse', [0, 0], [10, 10]), large = shapePoints('ellipse', [0, 0], [4000, 3000])
  assert.equal(small.length, 25); assert.equal(large.length, 97)
  close(small[0][0], small.at(-1)[0], 'closed'); close(small[0][1], small.at(-1)[1], 'closed')
  const circle = shapePoints('ellipse', [0, 0], [100, 40], { shift: true })
  for (const [x, y] of circle) close(Math.hypot(x - 50, y - 50), 50, 'Shift draws a circle')
})

test('shapes stay inside the drawing area and become valid saved strokes', () => {
  const box = { left: 2, right: 98, top: 2, bottom: 98 }
  for (const tool of ['line', 'arrow', 'rectangle', 'ellipse', 'diamond']) {
    assert.ok(isShapeTool(tool))
    const points = shapePoints(tool, [50, 50], [200, -40], { alt: true, box })
    assert.ok(points.every(([x, y]) => x >= 2 && x <= 98 && y >= 2 && y <= 98), tool)
    assert.ok(drawingData(makeStroke(points, 3, '#15805e', 1).drawing), `${tool} saves as a drawing`)
  }
  assert.equal(isShapeTool('pen'), false)
})

test('a click or tiny slip does not leave a shape behind', () => {
  assert.equal(shapeIsTiny('line', [0, 0], [2, 2]), true)
  assert.equal(shapeIsTiny('arrow', [0, 0], [10, 0]), false)
  assert.equal(shapeIsTiny('rectangle', [0, 0], [3, 3]), true)
  assert.equal(shapeIsTiny('rectangle', [0, 0], [3, 30]), false, 'a thin box is still a box')
})

test('every palette choice survives clipping, storage, rendering and stroke hit testing', () => {
  assert.equal(new Set(shapeTools).size, shapeTools.length, 'tool IDs are unique')
  assert.deepEqual(shapeGroups.map(group => group.tools.length), [6, 12, 20])
  const box = { left: 2, right: 598, top: 2, bottom: 398 }
  for (const tool of shapeTools) {
    assert.notEqual(shapeName(tool), 'Drawing', `${tool} has a descriptive saved label`)
    assert.match(shapeIcon(tool), /<path d="M/, `${tool} has a geometry preview`)
    for (const end of [[400, 300], [20, 300], [400, 20], [20, 20], [200, 150], [1000, -200]]) {
      for (const modifiers of [{}, { shift: true }, { alt: true }, { shift: true, alt: true }]) {
        const points = shapePoints(tool, [200, 150], end, { ...modifiers, size: 24, box })
        assert.ok(points.length >= 2 && points.length < 150, `${tool} stays lightweight`)
        assert.ok(points.every(([x, y]) => Number.isFinite(x + y) && x >= 2 && x <= 598 && y >= 2 && y <= 398), `${tool} stays inside the page`)
        const stroke = makeStroke(points, 24, '#15805e', 1).drawing
        assert.deepEqual(drawingData(JSON.parse(JSON.stringify(stroke))), stroke, `${tool} round-trips`)
        assert.ok(drawingSVG(stroke).includes('<path'), `${tool} renders in existing readers`)
        assert.ok(hitsStroke(stroke, ...stroke.points[0], 2), `${tool} remains selectable and erasable`)
      }
    }
  }
})

test('connectors follow the gesture and place their arrowheads along the final segment', () => {
  assert.deepEqual(shapePoints('elbow-line', [10, 20], [100, 80]), [[10, 20], [100, 20], [100, 80]])
  const elbow = shapePoints('elbow-arrow', [10, 20], [100, 80])
  assert.deepEqual(elbow[2], [100, 80])
  assert.ok(elbow[3][1] < 80 && elbow[5][1] < 80, 'both arrowhead barbs point back up the last segment')
  const double = shapePoints('double-arrow', [20, 50], [200, 50])
  assert.ok(double[2][0] < 200 && double[4][0] < 200, 'end head points forwards')
  assert.ok(double.at(-3)[0] > 20 && double.at(-1)[0] > 20, 'start head points backwards')
  for (const tool of ['curve', 'wave']) {
    const points = shapePoints(tool, [20, 50], [200, 50])
    close(points[0][0], 20, `${tool} start`); close(points.at(-1)[0], 200, `${tool} end`)
    close(points.at(-1)[1], 50, `${tool} end`)
    assert.ok(points.some(([, y]) => Math.abs(y - 50) > 5), `${tool} has a curve`)
  }
})

test('closed shapes keep a continuous outline in either drag direction', () => {
  const open = new Set(['line', 'elbow-line', 'curve', 'wave', 'bracket', 'brace', 'arrow', 'double-arrow', 'elbow-arrow', 'curved-arrow', 'cylinder', 'cube'])
  for (const tool of shapeTools.filter(tool => !open.has(tool))) {
    const points = shapePoints(tool, [200, 200], [20, 60])
    close(points[0][0], points.at(-1)[0], `${tool} closes x`)
    close(points[0][1], points.at(-1)[1], `${tool} closes y`)
    assert.ok(points.every(([x, y]) => x >= 20 - 1e-6 && x <= 200 + 1e-6 && y >= 60 - 1e-6 && y <= 200 + 1e-6), `${tool} respects its bounding box`)
  }
})
