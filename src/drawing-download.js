import { mediaAngle, mediaSize, rotatedSize } from '../format/media-geometry.mjs'

// Paint only the visible ink path. The SVG also has an invisible selection path
// in the editor, and other objects can overlap the drawing on the page.
function drawingCanvas(dom, attrs) {
  const svg = dom.querySelector(':scope > .fn-ink')
  const path = svg.querySelector('path')
  const frame = svg.viewBox.baseVal
  const angle = mediaAngle(attrs.mediaRotation)
  const ratio = attrs.frameRatio || frame.width / frame.height
  // A narrow reading viewport scales the whole drawing down on screen.
  // Export at its saved size on every device.
  const size = mediaSize(attrs.canvasWidth || attrs.width || frame.width, ratio, angle)
  const sx = size.width / frame.width, sy = size.height / frame.height

  // Strokes at the edge of a page can extend past their SVG viewport.
  const bounds = path.getBBox(), pen = Number(path.getAttribute('stroke-width'))
  const left = Math.min(0, bounds.x - pen / 2), top = Math.min(0, bounds.y - pen / 2)
  const right = Math.max(frame.width, bounds.x + bounds.width + pen / 2)
  const bottom = Math.max(frame.height, bounds.y + bounds.height + pen / 2)
  const output = rotatedSize((right - left) * sx, (bottom - top) * sy, angle)
  if (!(output.width > 0 && output.height > 0)) throw new Error('Drawing has no visible dimensions')
  const scale = Math.min(2, 2048 / Math.max(output.width, output.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(output.width * scale)
  canvas.height = Math.ceil(output.height * scale)
  const ctx = canvas.getContext('2d')
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(angle * Math.PI / 180)
  ctx.scale(sx * scale, sy * scale)
  ctx.translate(-(left + right) / 2, -(top + bottom) / 2)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = pen
  ctx.strokeStyle = path.getAttribute('stroke')
  ctx.globalAlpha = Number(path.getAttribute('opacity') || 1)
  ctx.stroke(new Path2D(path.getAttribute('d')))
  return canvas
}

export function drawingDownloadButton(dom, getAttrs, icon) {
  const title = 'Download as PNG'
  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.attachmentDownload = ''
  button.title = title
  button.setAttribute('aria-label', title)
  if (icon) button.innerHTML = icon('download')
  else button.textContent = 'Download PNG'
  button.addEventListener('click', async event => {
    event.stopPropagation()
    if (button.getAttribute('aria-busy') === 'true') return
    button.setAttribute('aria-busy', 'true')
    try {
      const attrs = getAttrs()
      const name = typeof attrs.label === 'string' ? attrs.label.replace(/[\\/:*?"<>|]/g, '-').trim().slice(0, 100) : ''
      const canvas = drawingCanvas(dom, attrs)
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
      canvas.width = canvas.height = 0
      if (!blob) throw new Error('Could not encode drawing')
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = (name || 'Drawing') + '.png'
      try { link.click() } finally { setTimeout(() => URL.revokeObjectURL(url), 30000) }
      button.title = title
    } catch {
      button.title = 'Couldn’t download the drawing. Click to try again.'
    } finally {
      button.setAttribute('aria-label', button.title)
      button.removeAttribute('aria-busy')
    }
  })
  return button
}
