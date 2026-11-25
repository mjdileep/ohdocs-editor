import { mediaAngle, mediaAxes, mediaSize, rotatedSize, rotationStyles } from '../format/media-geometry.mjs'

// Keep a vector image's own viewport at its intrinsic aspect ratio. Some
// browsers letterbox the SVG internally even when img has object-fit: fill.
export function setPictureRatio(image) {
  if (!image.naturalWidth || !image.naturalHeight) return
  image.style.setProperty('--fn-natural-ratio',image.naturalWidth/image.naturalHeight)
  image.dataset.naturalRatio = ''
}

export function paintRotation(dom, ratio, degrees) {
  const angle = mediaAngle(degrees)
  if (!angle || !ratio) { delete dom.dataset.mediaRotation; return }
  dom.dataset.mediaRotation = String(angle)
  for (const [key,value] of Object.entries(rotationStyles(ratio,angle,true))) dom.style.setProperty(key,value)
}

export function startMediaTransform(dom, view, attrs, pointer) {
  const rect = dom.getBoundingClientRect(), page = view.dom.getBoundingClientRect()
  const degrees = mediaAngle(attrs.mediaRotation), ratio = attrs.frameRatio || rect.width / rect.height
  const size = mediaSize(rect.width,ratio,degrees)
  const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2
  const pageScale = attrs.drawing && page.width <= 560 ? Math.min(1,page.width/(attrs.drawingPageWidth || page.width)) : 1
  return { rect, page, size, degrees, cx, cy, pageScale,
    startAngle: Math.atan2(pointer.y-cy,pointer.x-cx),
    positioned: attrs.layout === 'canvas' && (page.width > 560 || !!attrs.drawing) || page.width > 560 && !attrs.documentFlow,
  }
}

// When resizing, keep the opposite local corner fixed. When rotating, keep
// the centre fixed. Move the box back inside the page if it meets an edge.
export function mediaPlacement(start, size, degrees, rotating) {
  const box = rotatedSize(size.width,size.height,degrees), page = start.page
  const fit = Math.min(1,page.width/box.width)
  const width = box.width*fit, height = box.height*fit
  const {cos,sin} = mediaAxes(degrees)
  const dx = rotating ? 0 : (size.width*fit-start.size.width)/2
  const dy = rotating ? 0 : (size.height*fit-start.size.height)/2
  const x = Math.max(0,Math.min(page.width-width,start.cx-page.left+dx*cos-dy*sin-width/2))
  const y = Math.max(0,start.cy-page.top+dx*sin+dy*cos-height/2)
  return { width, x, y, attrs: {
    width: width/start.pageScale, canvasWidth: width/start.pageScale,
    frameRatio:size.width/size.height, mediaRotation:mediaAngle(degrees),
    ...(start.positioned ? {layout:'canvas',offset:x/page.width*100,gap:y/start.pageScale} : {}),
  } }
}

export function previewMedia(dom, change, positioned) {
  dom.style.width = change.width+'px'
  dom.dataset.frameRatio = String(change.attrs.frameRatio)
  dom.style.setProperty('--fn-frame-ratio',change.attrs.frameRatio)
  paintRotation(dom,change.attrs.frameRatio,change.attrs.mediaRotation)
  if (positioned) { dom.style.left=change.x+'px'; dom.style.top=change.y+'px' }
}
