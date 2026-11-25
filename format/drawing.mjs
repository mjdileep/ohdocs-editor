import { mediaAxes, mediaSize } from './media-geometry.mjs';

export function drawingData(value) {
  if (!value || !Array.isArray(value.points) || !value.points.length || value.points.length > 4096) return null;
  if (![value.width,value.height,value.size].every(n => Number.isFinite(n) && n > 0 && n <= 100000)) return null;
  if (!/^#[0-9a-f]{6}$/i.test(value.color)) return null;
  if (!value.points.every(p => Array.isArray(p) && p.length === 2 && p.every(n => Number.isFinite(n) && n >= 0 && n <= 100000))) return null;
  return { width:value.width, height:value.height, size:Math.min(40,value.size), color:value.color, opacity:value.opacity === .3 ? .3 : 1, points:value.points };
}
export function drawingSVG(value, { interactive=false } = {}) {
  const drawing = drawingData(value);
  if (!drawing) return '';
  const path = drawing.points.map(([x,y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ') + (drawing.points.length === 1 ? ' l.01 0' : '');
  const hit=interactive?`<path class="fn-ink-hit" d="${path}" stroke="transparent" stroke-width="16" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" fill="none" aria-hidden="true"/>`:'';
  return `<svg xmlns="http://www.w3.org/2000/svg" class="fn-ink" preserveAspectRatio="none" viewBox="0 0 ${drawing.width} ${drawing.height}" role="img" aria-label="Drawing"><path d="${path}" stroke="${drawing.color}" stroke-width="${drawing.size}" opacity="${drawing.opacity}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>${hit}</svg>`;
}
export function makeStroke(points, size, color, opacity) {
  const margin = size / 2 + 2;
  const left = Math.max(0, Math.min(...points.map(p => p[0])) - margin);
  const top = Math.max(0, Math.min(...points.map(p => p[1])) - margin);
  const width = Math.max(size + 4, Math.max(...points.map(p => p[0])) - left + margin);
  const height = Math.max(size + 4, Math.max(...points.map(p => p[1])) - top + margin);
  return { left, top, drawing: drawingData({ width, height, size, color, opacity, points: points.map(([x,y]) => [Math.round((x-left)*100)/100, Math.round((y-top)*100)/100]) }) };
}
export function hitsStroke(drawing, x, y, radius, scaleX = 1, scaleY = 1) {
  const points = drawing.points;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[Math.min(i+1, points.length-1)];
    const dx = (b[0]-a[0])*scaleX, dy = (b[1]-a[1])*scaleY;
    const rx = x - a[0]*scaleX, ry = y - a[1]*scaleY;
    const length = dx*dx + dy*dy;
    const t = length ? Math.max(0, Math.min(1, (rx*dx+ry*dy)/length)) : 0;
    if (Math.hypot(rx-t*dx, ry-t*dy) <= radius + drawing.size*Math.sqrt(scaleX*scaleY)/2) return true;
  }
  return false;
}

// Hit testing works in the same local coordinates as the SVG. A selection,
// the eraser and a later shape suggestion all follow the painted stroke.
export function drawingProjection(attrs,box) {
  const ink = attrs.drawing;
  const angle = attrs.mediaRotation || 0;
  const ratio = attrs.frameRatio || ink.width/ink.height;
  const size = mediaSize(box.width,ratio,angle), {cos,sin} = mediaAxes(angle);
  const sx = size.width/ink.width, sy = size.height/ink.height;
  const cx = box.x+box.width/2, cy = box.y+box.height/2;
  return {
    scale: Math.sqrt(sx*sy),
    point([x,y]) {
      const dx = x*sx-size.width/2, dy = y*sy-size.height/2;
      return [cx+dx*cos-dy*sin,cy+dx*sin+dy*cos];
    },
    hit(x,y,radius) {
      const dx = x-cx, dy = y-cy;
      return hitsStroke(ink,dx*cos+dy*sin+size.width/2,-dx*sin+dy*cos+size.height/2,radius,sx,sy);
    },
  };
}
