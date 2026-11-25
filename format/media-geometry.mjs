// The canvas stores the outer width. The media inside it keeps its own
// width-to-height ratio and rotates about the centre of that bounding box.
export function mediaAngle(value) {
  if (!Number.isFinite(value)) return 0
  return ((Math.round((value % 360)*10)+3600)%3600)/10
}

export function mediaAxes(degrees) {
  const radians = mediaAngle(degrees) * Math.PI / 180
  const clean = value => Math.abs(value) < 1e-10 ? 0 : value
  return { cos: clean(Math.cos(radians)), sin: clean(Math.sin(radians)) }
}

export function rotatedSize(width, height, degrees) {
  const { cos, sin } = mediaAxes(degrees)
  return { width: Math.abs(width*cos) + Math.abs(height*sin), height: Math.abs(width*sin) + Math.abs(height*cos) }
}

export function mediaSize(outerWidth, ratio, degrees) {
  const bounds = rotatedSize(ratio, 1, degrees)
  const height = outerWidth / bounds.width
  return { width: height * ratio, height }
}

// CSS percentages keep the same geometry in the editor, public reader and print.
export function rotationStyles(ratio, degrees, grips = false) {
  if (!mediaAngle(degrees) || !Number.isFinite(ratio) || ratio <= 0) return {}
  const { cos, sin } = mediaAxes(degrees), box = rotatedSize(ratio,1,degrees)
  const percent = value => (value * 100) + '%'
  const styles = {
    '--fn-rotation': mediaAngle(degrees) + 'deg',
    '--fn-outer-ratio': box.width / box.height,
    '--fn-media-width': percent(ratio / box.width),
    '--fn-media-height': percent(1 / box.height),
  }
  if (!grips) return styles
  const cursors = ['ew-resize','nwse-resize','ns-resize','nesw-resize']
  for (const [name,x,y] of [['width',ratio/2,0],['height',0,.5],['corner',ratio/2,.5]]) {
    styles['--fn-'+name+'-x'] = percent(.5 + (x*cos-y*sin)/box.width)
    styles['--fn-'+name+'-y'] = percent(.5 + (x*sin+y*cos)/box.height)
    const direction = mediaAngle(degrees+Math.atan2(y,x)*180/Math.PI)
    styles['--fn-'+name+'-cursor'] = cursors[Math.round(direction/45)%4]
  }
  return styles
}
