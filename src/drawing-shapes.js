// Every shape is saved as one ordinary drawing stroke. Existing editors and
// public readers can display it without a document-format migration.
export const shapeGroups = [
  { id: 'lines', label: 'Lines', tools: [
    ['line', 'Line', 'L'], ['elbow-line', 'Elbow connector'], ['curve', 'Curve'],
    ['wave', 'Wave'], ['bracket', 'Bracket'], ['brace', 'Brace'],
  ] },
  { id: 'arrows', label: 'Arrows', tools: [
    ['arrow', 'Arrow', 'A'], ['double-arrow', 'Double-ended arrow'], ['elbow-arrow', 'Elbow arrow'], ['curved-arrow', 'Curved arrow'],
    ['right-arrow', 'Right arrow'], ['left-arrow', 'Left arrow'], ['up-arrow', 'Up arrow'], ['down-arrow', 'Down arrow'],
    ['left-right-arrow', 'Left–right arrow'], ['up-down-arrow', 'Up–down arrow'], ['chevron', 'Chevron'], ['notched-arrow', 'Notched arrow'],
  ] },
  { id: 'shapes', label: 'Shapes', tools: [
    ['rectangle', 'Rectangle', 'R'], ['rounded-rectangle', 'Rounded rectangle'], ['ellipse', 'Ellipse', 'O'], ['diamond', 'Diamond', 'D'],
    ['triangle', 'Triangle'], ['right-triangle', 'Right triangle'], ['parallelogram', 'Parallelogram'], ['trapezoid', 'Trapezoid'],
    ['pentagon', 'Pentagon'], ['hexagon', 'Hexagon'], ['octagon', 'Octagon'], ['star', 'Five-point star'],
    ['star4', 'Four-point star'], ['star6', 'Six-point star'], ['heart', 'Heart'], ['cross', 'Cross'],
    ['cloud', 'Cloud'], ['speech-bubble', 'Speech bubble'], ['cylinder', 'Cylinder'], ['cube', 'Cube'],
  ] },
]
export const shapeTools = shapeGroups.flatMap(group => group.tools.map(([tool]) => tool))
export const isShapeTool = tool => shapeTools.includes(tool)
export const shapeName = tool => shapeGroups.flatMap(group => group.tools).find(([id]) => id === tool)?.[1] || 'Drawing'
const connectors = new Set(['line', 'elbow-line', 'curve', 'wave', 'arrow', 'double-arrow', 'elbow-arrow', 'curved-arrow'])
export const shapeHint = (tool, option = 'Alt') => connectors.has(tool)
  ? 'Shift for 45° steps'
  : `Shift for equal proportions, ${option} to draw from the centre`
const clampTo = ([x, y], box) => [Math.max(box.left, Math.min(box.right, x)), Math.max(box.top, Math.min(box.bottom, y))]
const closed = points => [...points, [...points[0]]]
const arc = (cx, cy, rx, ry, from, to, count) => Array.from({ length: count + 1 }, (_, i) => {
  const a = from + (to - from) * i / count
  return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]
})
const cubic = (a, b, c, d, count = 24) => Array.from({ length: count + 1 }, (_, i) => {
  const t = i / count, u = 1 - t
  return [0, 1].map(axis => u ** 3 * a[axis] + 3 * u * u * t * b[axis] + 3 * u * t * t * c[axis] + t ** 3 * d[axis])
})
const polygon = (count, inner = 1) => closed(Array.from({ length: inner === 1 ? count : count * 2 }, (_, i) => {
  const a = -Math.PI / 2 + i * Math.PI * 2 / (inner === 1 ? count : count * 2), r = i % 2 ? inner : 1
  return [.5 + .5 * r * Math.cos(a), .5 + .5 * r * Math.sin(a)]
}))
const blockArrow = [[0,.28],[.6,.28],[.6,0],[1,.5],[.6,1],[.6,.72],[0,.72]]
const doubleBlockArrow = [[0,.5],[.3,0],[.3,.28],[.7,.28],[.7,0],[1,.5],[.7,1],[.7,.72],[.3,.72],[.3,1]]

function outline(tool, width, height) {
  switch (tool) {
    case 'rectangle': return closed([[0,0],[1,0],[1,1],[0,1]])
    case 'rounded-rectangle': {
      const r = Math.min(width, height) * .2, rx = width ? r / width : 0, ry = height ? r / height : 0
      return closed([[rx,0], ...arc(1-rx,ry,rx,ry,-Math.PI/2,0,8), ...arc(1-rx,1-ry,rx,ry,0,Math.PI/2,8), ...arc(rx,1-ry,rx,ry,Math.PI/2,Math.PI,8), ...arc(rx,ry,rx,ry,Math.PI,Math.PI*1.5,8)])
    }
    case 'ellipse': return arc(.5,.5,.5,.5,0,Math.PI*2,Math.max(24,Math.min(96,Math.round((width+height)*Math.PI/8))))
    case 'diamond': return closed([[.5,0],[1,.5],[.5,1],[0,.5]])
    case 'triangle': return closed([[.5,0],[1,1],[0,1]])
    case 'right-triangle': return closed([[0,0],[1,1],[0,1]])
    case 'parallelogram': return closed([[.25,0],[1,0],[.75,1],[0,1]])
    case 'trapezoid': return closed([[.25,0],[.75,0],[1,1],[0,1]])
    case 'pentagon': return polygon(5)
    case 'hexagon': return polygon(6)
    case 'octagon': return polygon(8)
    case 'star': return polygon(5,.43)
    case 'star4': return polygon(4,.3)
    case 'star6': return polygon(6,.5)
    case 'heart': return [...cubic([.5,.22],[.1,-.3],[-.35,.35],[.5,1]), ...cubic([.5,1],[1.35,.35],[.9,-.3],[.5,.22]).slice(1)]
    case 'cross': return closed([[.34,0],[.66,0],[.66,.34],[1,.34],[1,.66],[.66,.66],[.66,1],[.34,1],[.34,.66],[0,.66],[0,.34],[.34,.34]])
    case 'cloud': return closed([
      ...cubic([.2,.85],[.02,.85],[0,.48],[.2,.45]),
      ...cubic([.2,.45],[.12,.14],[.48,.03],[.58,.28]).slice(1),
      ...cubic([.58,.28],[.78,.1],[.98,.25],[.91,.47]).slice(1),
      ...cubic([.91,.47],[1,.47],[1,.85],[.81,.85]).slice(1),
    ])
    case 'speech-bubble': return closed([[0,0],[1,0],[1,.72],[.45,.72],[.18,1],[.22,.72],[0,.72]])
    case 'cylinder': return [...arc(.5,.15,.5,.15,0,Math.PI*2,32),[1,.85],...arc(.5,.85,.5,.15,0,Math.PI,16).slice(1),[0,.15]]
    case 'cube': return [[0,.25],[.65,0],[1,.25],[1,.75],[.35,1],[0,.75],[0,.25],[.35,.5],[1,.25],[.35,.5],[.35,1]]
    case 'bracket': return [[.8,0],[.2,0],[.2,1],[.8,1]]
    case 'brace': return [...cubic([.8,0],[.2,0],[.7,.4],[.2,.5]),...cubic([.2,.5],[.7,.6],[.2,1],[.8,1]).slice(1)]
    case 'right-arrow': return closed(blockArrow)
    case 'left-arrow': return closed(blockArrow.map(([x,y])=>[1-x,y]))
    case 'up-arrow': return closed(blockArrow.map(([x,y])=>[y,1-x]))
    case 'down-arrow': return closed(blockArrow.map(([x,y])=>[y,x]))
    case 'left-right-arrow': return closed(doubleBlockArrow)
    case 'up-down-arrow': return closed(doubleBlockArrow.map(([x,y])=>[y,x]))
    case 'chevron': return closed([[0,0],[.55,0],[1,.5],[.55,1],[0,1],[.45,.5]])
    case 'notched-arrow': return closed([...blockArrow,[.18,.5]])
    default: return []
  }
}

function connector(tool, start, end, size) {
  const [x0,y0]=start,[x1,y1]=end,dx=x1-x0,dy=y1-y0,length=Math.hypot(dx,dy)
  let points
  if(tool.startsWith('elbow')) points=[start,[x1,y0],end]
  else if(tool==='curve'||tool==='curved-arrow') points=cubic(start,[x0+dx/3-dy*.3,y0+dy/3+dx*.3],[x0+dx*2/3-dy*.3,y0+dy*2/3+dx*.3],end,32)
  else if(tool==='wave') points=Array.from({length:49},(_,i)=>{const t=i/48,s=Math.sin(t*Math.PI*4)*.1;return [x0+dx*t-dy*s,y0+dy*t+dx*s]})
  else points=[start,end]
  if(tool.includes('arrow')&&length>=1){
    const head=Math.min(length*.45,Math.max(10,size*3.5)),spread=Math.PI/7
    const addHead=(tip,previous)=>{
      const angle=Math.atan2(tip[1]-previous[1],tip[0]-previous[0])
      const barb=side=>[tip[0]-head*Math.cos(angle+side*spread),tip[1]-head*Math.sin(angle+side*spread)]
      points.push(barb(1),tip,barb(-1))
    }
    const beforeEnd=[...points].reverse().find(p=>Math.hypot(p[0]-x1,p[1]-y1)>.01)||start
    addHead(end,beforeEnd)
    if(tool==='double-arrow'){points.push(end,start);addHead(start,end)}
  }
  return points
}

// Shift constrains angles or proportions; Alt grows outlines from the centre.
export function shapePoints(tool, start, end, { shift=false, alt=false, size=3, box }={}) {
  if(!isShapeTool(tool))return []
  const [x0,y0]=start
  let [x1,y1]=end,points
  if(connectors.has(tool)){
    if(shift){const step=Math.PI/4,length=Math.hypot(x1-x0,y1-y0),angle=Math.round(Math.atan2(y1-y0,x1-x0)/step)*step;x1=x0+Math.cos(angle)*length;y1=y0+Math.sin(angle)*length}
    points=connector(tool,start,[x1,y1],size)
  }else{
    let width=x1-x0,height=y1-y0
    if(shift){const side=Math.max(Math.abs(width),Math.abs(height));width=(width<0?-1:1)*side;height=(height<0?-1:1)*side}
    const left=alt?x0-Math.abs(width):Math.min(x0,x0+width),right=alt?x0+Math.abs(width):Math.max(x0,x0+width)
    const top=alt?y0-Math.abs(height):Math.min(y0,y0+height),bottom=alt?y0+Math.abs(height):Math.max(y0,y0+height)
    points=outline(tool,right-left,bottom-top).map(([x,y])=>[left+x*(right-left),top+y*(bottom-top)])
  }
  return box?points.map(point=>clampTo(point,box)):points
}
export function shapeIsTiny(tool,start,end){
  const dx=Math.abs(end[0]-start[0]),dy=Math.abs(end[1]-start[1])
  return connectors.has(tool)?Math.hypot(dx,dy)<4:dx<4&&dy<4
}

// Use the actual shape geometry for previews, so the palette matches the ink.
export function shapeIcon(tool){
  const points=shapePoints(tool,connectors.has(tool)?[4,20]:[3,3],connectors.has(tool)?[20,4]:[21,21],{size:1})
  const d=points.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`
}
