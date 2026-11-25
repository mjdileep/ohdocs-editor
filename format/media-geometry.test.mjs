import test from 'node:test'
import assert from 'node:assert/strict'
import { mediaAngle, mediaSize, rotatedSize, rotationStyles } from './media-geometry.mjs'
import { drawingProjection } from './drawing.mjs'
import { renderDoc } from './render.mjs'

const near = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} should equal ${b}`)

test('a rotated bounding box recovers the stretched local dimensions at any angle', () => {
  for (const ratio of [.05,.5,1,3,20]) for (const angle of [-90,0,15,45,90,135,180,270,359.9]) {
    const box = rotatedSize(120*ratio,120,angle)
    const size = mediaSize(box.width,ratio,angle)
    near(size.width,120*ratio); near(size.height,120)
  }
  assert.equal(mediaAngle(-1.2),358.8)
  assert.deepEqual(rotationStyles(2,'90deg'),{})
})

test('rotated ink is selectable and erasable where the stroke appears', () => {
  const drawing = {width:100,height:50,points:[[0,0],[100,0]],size:2}
  const projection = drawingProjection({drawing,frameRatio:3,mediaRotation:90},{x:40,y:30,width:60,height:180})
  assert.deepEqual(projection.point([0,0]),[100,30])
  assert.deepEqual(projection.point([100,0]),[100,210])
  assert.equal(projection.hit(100,120,4),true)
  assert.equal(projection.hit(72,120,4),false)
})

test('published rotation uses the same proportions and validates saved angles', () => {
  const attrs = {width:120,frameRatio:2,mediaRotation:90,videoSource:'https://example.test/movie.mp4'}
  const styles = new Map()
  const html = renderDoc({type:'previewAttachment',attrs},styles)
  assert.match(html,/data-media-rotation="90"/)
  assert.match([...styles.keys()][0],/--fn-outer-ratio:0.5;/)
  assert.deepEqual(rotatedSize(200,100,90),{width:100,height:200})
  assert.doesNotMatch(renderDoc({type:'previewAttachment',attrs:{...attrs,mediaRotation:'invalid'}}),/data-media-rotation/)
})
