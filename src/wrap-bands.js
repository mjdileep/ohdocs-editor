// Rectangular exclusions are independent of the DOM order of the objects.
// Each horizontal band leaves one readable channel; narrower pockets close.
export function wrappingBands(boxes, pageWidth, minimum = 192, padding = 12) {
  const width = Math.max(1, pageWidth)
  const occupied = boxes.filter(b => b.width > 0 && b.height > 0).map(b => ({
    left: Math.max(0, b.x - padding), right: Math.min(width, b.x + b.width + padding),
    top: Math.max(0, b.y - padding / 2), bottom: Math.max(0, b.y + b.height + padding / 2),
  })).filter(b => b.right > b.left && b.bottom > b.top)
  const edges = [...new Set([0, ...occupied.flatMap(b => [b.top, b.bottom])])].sort((a,b) => a-b)
  const bands = []
  let previous = null
  for (let index = 0; index < edges.length - 1; index++) {
    const top = edges[index], bottom = edges[index + 1]
    const intervals = occupied.filter(b => b.top < bottom && b.bottom > top).sort((a,b) => a.left-b.left)
    const gaps = []
    let end = 0
    for (const box of intervals) {
      if (box.left > end) gaps.push({left:end,right:box.left})
      end = Math.max(end,box.right)
    }
    if (end < width) gaps.push({left:end,right:width})
    // Equal-width alternatives keep the previous side instead of flickering.
    gaps.sort((a,b) => (b.right-b.left)-(a.right-a.left) ||
      (previous ? Math.abs(a.left-previous.left)-Math.abs(b.left-previous.left) : a.left-b.left))
    const gap = gaps[0]
    const channel = gap && gap.right-gap.left >= Math.min(minimum,width) ? gap : {left:width,right:width}
    const band = {top,height:bottom-top,left:channel.left,right:width-channel.right}
    const last = bands.at(-1)
    if (last && Math.abs(last.left-band.left)<.01 && Math.abs(last.right-band.right)<.01) last.height += band.height
    else bands.push(band)
    previous = channel
  }
  return bands
}

export function canvasPosition(box, dx, dy, pageWidth) {
  return { ...box, x:Math.max(0,Math.min(Math.max(0,pageWidth-box.width),box.x+dx)), y:Math.max(0,Math.min(100000,box.y+dy)) }
}
