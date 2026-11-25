import test from 'node:test'
import assert from 'node:assert/strict'
import { wrappingBands, canvasPosition } from './wrap-bands.js'

test('wrapping starts above objects and opens again underneath them',()=>{
  assert.deepEqual(wrappingBands([{x:0,y:100,width:200,height:80}],800,192,0),[
    {top:0,height:100,left:0,right:0},
    {top:100,height:80,left:200,right:0},
  ])
  assert.deepEqual(wrappingBands([],800),[])
})

test('crowded and overlapping objects close unreadable text pockets',()=>{
  assert.deepEqual(wrappingBands([{x:0,y:0,width:350,height:100},{x:450,y:0,width:350,height:100}],800,192,0),[
    {top:0,height:100,left:800,right:0},
  ])
  assert.deepEqual(wrappingBands([{x:0,y:0,width:300,height:100},{x:200,y:0,width:300,height:100}],800,192,0),[
    {top:0,height:100,left:500,right:0},
  ])
})

test('random overlapping layouts never put a readable text channel through an object',()=>{
  let seed=20261115
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32}
  for(let trial=0;trial<500;trial++){
    const width=600+random()*500
    const boxes=Array.from({length:12},()=>({x:random()*width,y:random()*1200,width:40+random()*400,height:40+random()*300}))
    const bands=wrappingBands(boxes,width,192,12)
    let end=0
    for(const band of bands){
      assert.ok(Math.abs(band.top-end)<1e-8,'bands cover the complete vertical range without gaps')
      end=band.top+band.height
      const left=band.left,right=width-band.right
      if(right-left<1e-8)continue
      assert.ok(right-left>=192-1e-8)
      for(const box of boxes){
        if(box.y-6>=end||box.y+box.height+6<=band.top)continue
        assert.ok(right<=box.x-12+1e-8||left>=box.x+box.width+12-1e-8,'text stays outside the padded rectangle')
      }
    }
  }
})

test('dragging is continuous, independent of neighbors and clamped only at page edges',()=>{
  const box={x:300,y:400,width:180,height:80}
  assert.deepEqual(canvasPosition(box,-85.5,-121.25,780),{...box,x:214.5,y:278.75})
  assert.deepEqual(canvasPosition(box,10000,-1000,780),{...box,x:600,y:0})
  assert.deepEqual(canvasPosition(box,0,0,100),{...box,x:0})
  assert.deepEqual(box,{x:300,y:400,width:180,height:80},'preview never changes its starting geometry')
})
