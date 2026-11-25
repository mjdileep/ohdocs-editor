import test from 'node:test'
import assert from 'node:assert/strict'
import { drawingPath, canStartDrawing } from './drawing-path.js'
const box={left:0,top:0,right:100,bottom:100}
const draw=points=>{const path=drawingPath();for(const point of points)path.add(point,box);return path.segments}

test('a held pointer entering from any edge starts ink at the boundary',()=>{
  for(const [outside,inside,entry] of [
    [[-30,50],[50,50],[0,50]],[[130,50],[50,50],[100,50]],[[50,-30],[50,50],[50,0]],[[50,130],[50,50],[50,100]]
  ])assert.deepEqual(draw([outside,inside]),[[entry,inside]])
  assert.deepEqual(draw([[-20,40],[120,40]]),[[[0,40],[100,40]]],'fast movement crossing the page still draws its inside portion')
})
test('leaving and re-entering produces separate strokes without drawing along the boundary or connecting outside travel',()=>{
  assert.deepEqual(draw([[30,20],[-20,20],[-20,80],[40,80]]),[[[30,20],[0,20]],[[0,80],[40,80]]])
  assert.deepEqual(draw([[-20,10],[-20,90],[-5,95]]),[])
  assert.deepEqual(draw([[30,20],[30,20]]),[[[30,20]]],'a stationary in-page click remains a dot')
})
test('stroke limits remain bounded across repeated exits and re-entry',()=>{
  const path=drawingPath(12)
  for(let i=0;i<100;i++)path.add([i%2?-10:50,i],box)
  assert.equal(path.segments.flat().length,12)
  assert.ok(path.segments.every(segment=>segment.length))
  assert.ok(path.segments.flat().every(([x,y])=>x>=0&&x<=100&&y>=0&&y<=100))
})
test('outside presses are armed only in the page or its gutter, without consuming controls or other panels',()=>{
  const overlay={},scroller={contains:target=>target.inScroller},target={inScroller:true,closest:()=>null}
  assert.equal(canStartDrawing(overlay,overlay,scroller),true)
  assert.equal(canStartDrawing(target,overlay,scroller),true)
  assert.equal(canStartDrawing({...target,closest:()=>({})},overlay,scroller),false)
  assert.equal(canStartDrawing({...target,inScroller:false},overlay,scroller),false)
})
