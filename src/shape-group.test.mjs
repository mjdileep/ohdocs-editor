import test from 'node:test'
import assert from 'node:assert/strict'
import { matchPenGroup, strokeBounds } from './shape-group.js'
import { recognizeStrokes } from './shape-recognition.js'
import { drawingBox } from './canvas-layout.js'

const entry = points => ({points, box: strokeBounds(points)})
const box = [
  [[577,473],[660,465],[754,457],[828,455],[855,451]],
  [[878,752],[843,746],[770,746],[676,745],[609,752]],
  [[855,451],[855,542],[845,597],[846,648],[877,727],[878,752]],
  [[604,772],[604,702],[604,586],[604,470]],
]
const arc = (start, end) => Array.from({length: 24}, (_, i) => {
  const a = start + (end - start) * i / 23
  return [154 + 100*Math.cos(a), 131 + 52*Math.sin(a)]
})

test('fits rough sides drawn separately in any order, including crossed and gapped corners', () => {
  for (let last = 0; last < box.length; last++) {
    const others = box.filter((_, i) => i !== last).map(entry)
    const stray = entry([[654,562],[710,585]])
    const match = matchPenGroup(box[last].toReversed(), [others[1], stray, others[2], others[0]])
    assert.equal(match?.tool, 'rectangle')
    assert.deepEqual(new Set(match.members), new Set(others))
  }
})

test('keeps the rectangle when the start overshoots and the corner is retraced', () => {
  const points = [[146,451],[163,423],[218,361],[257,332],[273,336],[303,361],[282,362],[188,347],
    [177,350],[181,339],[200,316],[202,440],[204,609],[223,609],[380,608],[408,601],[518,599],
    [512,566],[511,421],[513,329],[505,337],[440,338],[396,334],[262,334],[212,366]]
  for (const path of [points, points.toReversed()]) {
    assert.equal(recognizeStrokes([path])?.tool, 'rectangle')
  }
})

test('fits arcs with gaps and arrows with independently drawn wings', () => {
  for (const arcs of [[arc(.05,3.1), arc(6.15,3.23)], [arc(.03,5.94), arc(5.95,6.28)]]) {
    const match = matchPenGroup(arcs[1], [entry(arcs[0])])
    assert.equal(match?.tool, 'ellipse')
    assert.equal(match.members.length, 1)
  }
  const shaft = [[10,40],[152,42]], top = [[128,24],[151,41]], bottom = [[125,61],[151,41]]
  for (const paths of [[shaft, [...top,bottom[0]]], [top, bottom, shaft], [top, shaft, bottom]]) {
    const match = matchPenGroup(paths.at(-1), paths.slice(0,-1).map(entry))
    assert.equal(match?.tool, 'arrow')
    assert.equal(match.members.length, paths.length - 1)
  }
})

test('a complete five-stroke star uses every contributing stroke', () => {
  const star = [[[0,40],[90,41]],[[90,41],[20,96]],[[21,95],[45,5]],[[45,6],[79,94]],[[77,95],[1,40]]]
  const match = matchPenGroup(star.at(-1), star.slice(0,-1).map(entry))
  assert.equal(match?.tool, 'star')
  assert.equal(match.members.length, 4)
})

test('recognizes tilted triangles with unequal sides and slightly open seams', () => {
  const sides = [[[0,85],[34,0]],[[150,107],[4,88]],[[37,3],[153,104]]]
  for (const angle of [-.71,-.27,.22,.68]) {
    const paths = sides.map(side => side.map(([x,y]) =>
      [x*Math.cos(angle) - y*Math.sin(angle), x*Math.sin(angle) + y*Math.cos(angle)]))
    const match = matchPenGroup(paths[0], paths.slice(1).map(entry))
    assert.equal(match?.tool, 'triangle')
    assert.equal(match.members.length, 2)
  }
})

test('keeps scribbles, isolated lines, an adjacent closed sketch and missing sides independent', () => {
  const marks = [
    [[0,20],[8,42],[14,5],[18,3],[22,43],[31,32],[40,39],[45,10],[48,2],[52,40],[62,38]],
    [[40,35],[105,90],[54,80],[113,42],[65,61],[102,104],[110,85]],
    [[30,60],[140,60],[35,60],[140,60],[34,61]], [[30,40],[30,40]],
  ]
  for (const points of marks) assert.equal(matchPenGroup(points, []), null)
  const mark = entry([[0,50],[100,50]]), closed = entry(arc(0,Math.PI*2))
  for (const line of [[[50,0],[50,100]], [[0,90],[100,90]]]) {
    assert.deepEqual(matchPenGroup(line, [mark, closed]).members, [])
  }
  assert.notEqual(matchPenGroup(box[2], box.slice(0,2).map(entry))?.tool, 'rectangle')
})

test('reads ink at the same scale and position as the responsive page and after resizing', () => {
  const ink = {canvasWidth:200, drawingPageWidth:800, drawing:{width:100,height:50}, offset:95, gap:60}
  assert.deepEqual(drawingBox(ink, 400), {x:300,y:30,width:100,height:50})
  assert.deepEqual(drawingBox(ink, 800), {x:600,y:60,width:200,height:100})
})

test('keeps the short edges of a long bowed box and fits the box drawn in two open strokes', () => {
  const shallow = [[0,10],[11,45],[59,36],[110,33],[256,32],[330,38],[320,7],[270,1],[61,2],[22,10],[0,10]]
  const rectangle = recognizeStrokes([shallow])
  assert.equal(rectangle?.tool, 'rectangle')
  const bounds = strokeBounds(rectangle.points)
  assert.ok((bounds.right-bounds.left)/(bounds.bottom-bounds.top) > 6)
  const a = [[7,40],[25,87],[28,82],[45,78],[90,78],[82,0]]
  const b = [[82,0],[74,10],[60,18],[0,35],[9,44]]
  const result = matchPenGroup(b,[entry(a)])
  assert.equal(result?.tool,'rectangle')
  assert.equal(result.members.length,1)
})

test('recovers the points of an uneven star, including its separately drawn spike', () => {
  const a = [[53,1],[58,25]], b = [[52,0],[73,17]]
  const body = [[73,17],[92,0],[92,18],[87,25],[118,31],[98,32],[88,41],[91,88],[67,50],
    [46,83],[45,45],[0,35],[47,30],[32,10],[54,27],[58,18]]
  for (const strokes of [[a,b,body],[body,a,b]]) {
    const match = matchPenGroup(strokes.at(-1),strokes.slice(0,-1).map(entry))
    assert.equal(match?.label,'7-point star')
    assert.equal(match.points.length,15)
    assert.equal(match.members.length,2)
  }
})

test('a freeform closed silhouette can be smoothed explicitly and a small scribble stays freehand', () => {
  const leaf = [[48,91],[18,73],[4,53],[0,15],[8,6],[35,0],[51,25],[57,58],[78,60],
    [98,71],[74,70],[63,74],[42,93],[48,91]]
  const result = recognizeStrokes([leaf])
  assert.equal(result?.tool,'outline')
  assert.equal(result.confirm,true)
  assert.deepEqual(result.points[0],result.points.at(-1))
  assert.equal(recognizeStrokes([[[4,3],[6,7],[2,4],[8,6],[3,2]]]),null)
})
