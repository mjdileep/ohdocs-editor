import assert from 'node:assert/strict'
import test from 'node:test'
import { recognizeShape } from './shape-recognition.js'
import { shapePoints, shapeTools } from './drawing-shapes.js'

test('recognizes a rough loop from an arbitrary seam and in either direction', () => {
  const loop = [[156,113],[150,91],[133,78],[110,74],[89,81],[75,96],[70,120],
    [78,140],[97,156],[118,158],[139,151],[153,135],[158,117]]
  for (const points of [loop, [...loop].reverse()]) {
    const result = recognizeShape(points)
    assert.equal(result.tool, 'ellipse')
    assert.equal(result.label, 'Circle')
    assert.ok(result.points.length > 48)
  }
})

test('recognizes corners, one-stroke arrows and stars from hand-entered points', () => {
  const examples = {
    rectangle: [[47,55],[120,54],[186,56],[185,92],[186,121],[104,123],[48,120],[46,92],[49,57]],
    triangle: [[114,30],[134,66],[158,106],[125,103],[71,105],[93,67],[110,34]],
    arrow: [[29,87],[70,86],[136,89],[113,75],[136,89],[111,101]],
    star: [[50,7],[81,100],[4,42],[98,42],[21,100],[49,10]],
  }
  for (const [tool, points] of Object.entries(examples)) {
    assert.equal(recognizeShape(points)?.tool, tool, tool)
    assert.equal(recognizeShape([...points].reverse())?.tool, tool, tool + ' reversed')
  }
})

test('preserves the tilt of a long rectangle instead of squaring it to the page', () => {
  const points = [[80,70],[184,130],[164,165],[60,105],[79,72]]
  const result = recognizeShape(points)
  assert.equal(result?.tool, 'rectangle')
  const angle = Math.atan2(result.points[1][1]-result.points[0][1],result.points[1][0]-result.points[0][0])
  assert.ok(Math.abs(angle - Math.PI / 6) < .08)
})

test('ignores small handwritten marks, retracing, loops in handwriting and scribbles', () => {
  const marks = [
    [[0,0],[2,1]], [[0,20],[14,0],[19,3],[5,21],[23,24]],
    [[30,60],[140,60],[35,60],[140,60],[34,61]],
    [[0,20],[8,42],[14,5],[18,3],[22,43],[31,32],[40,39],[45,10],[48,2],[52,40],[62,38]],
    [[40,35],[105,90],[54,80],[113,42],[65,61],[102,104],[110,85]],
  ]
  for (const mark of marks) assert.equal(recognizeShape(mark), null)
})

test('the recognizer can match each single-stroke palette example', () => {
  for (const tool of shapeTools) {
    const points = shapePoints(tool, [100,100], [280,220])
    assert.equal(recognizeShape(points)?.tool, tool, tool)
  }
})
