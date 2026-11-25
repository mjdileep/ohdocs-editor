// Work in page units so a wobble along the long side of a shallow box has
// the same weight as the same wobble on a square.
const distance = (a, b) => Math.hypot(a[0]-b[0], a[1]-b[1])
const cross = (a, b, c) => (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0])
const mix = (a, b, t) => [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t]

function lineError(p, a, b) {
  const dx = b[0]-a[0], dy = b[1]-a[1]
  const t = Math.max(0, Math.min(1, ((p[0]-a[0])*dx + (p[1]-a[1])*dy)/(dx*dx + dy*dy || 1)))
  return Math.hypot(p[0]-a[0]-t*dx, p[1]-a[1]-t*dy)
}

// A stylus can contribute hundreds of samples on one edge and just one at
// the tip. Preserve the tip before falling back to uniform resampling.
export function compactPenPoints(points, limit) {
  const ends = new Set([0, points.length-1]), pending = [[0,points.length-1]]
  while (pending.length) {
    const [from,to] = pending.pop()
    let error = .45, split = -1
    for (let i = from+1; i < to; i++) {
      const deviation = lineError(points[i],points[from],points[to])
      if (deviation > error) { error = deviation; split = i }
    }
    if (split < 0) continue
    ends.add(split)
    if (ends.size > limit) return null
    pending.push([from,split],[split,to])
  }
  return [...ends].sort((a,b)=>a-b).map(i=>points[i])
}

// Split the arc with the largest deviation from its chord. Starting with
// opposite points makes the decomposition independent of where the pen lifted.
function corners(points, tolerance) {
  const farthest = start => points.reduce((best, p, i) =>
    distance(points[start], p) > distance(points[start], points[best]) ? i : best, start)
  const a = farthest(0), b = farthest(a)
  const indices = [a,b].sort((i,j) => i-j)
  let four
  while (indices.length < 36) {
    let worst = 0, insert = -1, index
    for (let side = 0; side < indices.length; side++) {
      const from = indices[side], to = indices[(side+1)%indices.length]
      for (let j = (from+1)%points.length; j !== to; j = (j+1)%points.length) {
        const error = lineError(points[j], points[from], points[to])
        if (error > worst) { worst = error; insert = side+1; index = j }
      }
    }
    if (worst <= tolerance) break
    indices.splice(insert, 0, index)
    if (indices.length === 4) four = indices.slice()
  }
  return {four, indices, outline: indices.map(i => points[i])}
}

function rectangleFit(points, indices, shortSide) {
  if (!indices) return null
  const vertices = indices.map(i => points[i])
  const sides = vertices.map((a,i) => distance(a, vertices[(i+1)%4]))
  for (let i = 0; i < 4; i++) {
    const a = vertices[i], b = vertices[(i+1)%4], c = vertices[(i+2)%4]
    const length = sides[i], next = sides[(i+1)%4]
    if (length < 7 || length < .48*sides[(i+2)%4]) return null
    const cosine = ((b[0]-a[0])*(c[0]-b[0])+(b[1]-a[1])*(c[1]-b[1]))/(length*next)
    if (Math.abs(cosine) > .65) return null
    let sum = 0, travelled = 0, peak = 0, previousError = 0
    const end = indices[(i+1)%4]
    for (let j = indices[i]; j !== end;) {
      const prev = points[j]
      j = (j+1)%points.length
      const error = lineError(points[j], a, b)
      const step = distance(prev,points[j])
      peak = Math.max(peak, error)
      sum += step*(error*error+previousError*error+previousError*previousError)/3
      travelled += step
      previousError = error
    }
    const tolerance = Math.max(1.8, Math.min(length*.083, shortSide*.19))
    if (peak > 2*tolerance || sum > travelled*tolerance*tolerance) return null
  }
  // The long edges carry the orientation. A leaning end cap on a long box
  // should not tilt its entire length when we square up the corners.
  const start = sides[0]+sides[2] >= sides[1]+sides[3] ? 0 : 1
  const axis = [0,1].map(k => vertices[(start+1)%4][k]-vertices[start][k]
    + vertices[(start+2)%4][k]-vertices[(start+3)%4][k])
  let angle = Math.atan2(axis[1],axis[0])
  const upright = Math.round(angle/(Math.PI/2))*Math.PI/2
  if (Math.abs(angle-upright) < Math.PI/36) angle = upright
  const u = [Math.cos(angle),Math.sin(angle)], v = [-u[1],u[0]]
  const center = [0,1].map(k => vertices.reduce((sum,p) => sum+p[k], 0)/4)
  const extent = dir => vertices.reduce((sum,p) =>
    sum+Math.abs((p[0]-center[0])*dir[0]+(p[1]-center[1])*dir[1]),0)/4
  let w = extent(u), h = extent(v)
  const square = Math.abs(w-h) < .095*Math.max(w,h)
  if (square) w = h = (w+h)/2
  return {tool:'rectangle', label:square ? 'Square' : undefined, score:.05,
    points:[[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]].map(([x,y]) =>
      [center[0]+u[0]*x*w+v[0]*y*h, center[1]+u[1]*x*w+v[1]*y*h])}
}

function crossesItself(vertices) {
  const n = vertices.length
  for (let i = 0; i < n; i++) {
    const a = vertices[i], b = vertices[(i+1)%n]
    for (let j = i+2; j < n; j++) {
      if (!i && j === n-1) continue
      const c = vertices[j], d = vertices[(j+1)%n]
      if (cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0) return true
    }
  }
  return false
}

// A pen often continues a little beyond the starting edge. Close the contour
// at the actual intersection if just the short ends would be trimmed.
function trimSeam(points) {
  const stops = [0]
  for (let i=1; i<points.length; i++) stops.push(stops[i-1]+distance(points[i-1],points[i]))
  const total = stops.at(-1), limit = total*.14
  for (let i=0; i+1<points.length && stops[i]<limit; i++) {
    const a = points[i], b = points[i+1]
    for (let j=points.length-2; j>i+1 && stops[i]+total-stops[j+1]<limit; j--) {
      const c = points[j], d = points[j+1]
      const ca = cross(c,d,a), cb = cross(c,d,b), ac = cross(a,b,c), ad = cross(a,b,d)
      if (ca*cb >= 0 || ac*ad >= 0) continue
      const at = mix(a,b,ca/(ca-cb))
      if (stops[i]+distance(a,at)+total-stops[j+1]+distance(at,d) <= limit)
        return [at,...points.slice(i+1,j+1),at]
    }
  }
  return points
}

function regularStar(vertices, area, box) {
  const peaks = [], notches = []
  for (let i = 0; i < vertices.length; i++) {
    const p = vertices[i], a = vertices.at(i-1), b = vertices[(i+1)%vertices.length]
    const cosine = ((a[0]-p[0])*(b[0]-p[0])+(a[1]-p[1])*(b[1]-p[1]))/(distance(a,p)*distance(b,p))
    if (cross(a,p,b)*area > 0) {
      if (cosine > -.25) peaks.push(p)
    } else if (cosine > -.75) notches.push(p)
  }
  const count = peaks.length
  if (count < 4 || count > 9 || Math.abs(count-notches.length) > 1) return null
  const center = [0,1].map(k => notches.reduce((n,p)=>n+p[k],0)/notches.length)
  const polar = p => [2*(p[0]-center[0])/box.width, 2*(p[1]-center[1])/box.height]
  const valleys = notches.map(p => Math.hypot(...polar(p)))
  const tips = peaks.map(p => {const [x,y] = polar(p); return Math.atan2(y,x)})
  if (Math.max(...valleys) > .90 || peaks.some(p => Math.hypot(...polar(p)) < .58)) return null
  tips.sort((a,b)=>a-b)
  const step = 2*Math.PI/count
  const offset = tips.reduce((sum,a,i)=>sum+a-i*step,0)/count
  if (tips.some((tip,i)=>Math.abs(tip-offset-i*step) > step*.60)) return null
  const inner = Math.max(.28,Math.min(.6,valleys.reduce((sum,r)=>sum+r,0)/valleys.length))
  const points = Array.from({length:2*count}, (_,i) => {
    const angle = offset+i*step/2, radius = i%2 ? inner : 1
    return [radius*Math.cos(angle),radius*Math.sin(angle)]
  })
  // Fit the clean tips into the same bounds even when none points straight up.
  const axes = [0,1].map(k => points.map(p => p[k]))
  const min = axes.map(values => Math.min(...values)), max = axes.map(values => Math.max(...values))
  const fitted = points.map(([x,y]) => [box.left+(x-min[0])*box.width/(max[0]-min[0]),
    box.top+(y-min[1])*box.height/(max[1]-min[1])])
  return {tool:({4:'star4',6:'star6'})[count] || 'star', label:count+'-point star',
    points:[...fitted,fitted[0]], score:.05}
}

// Round gentle turns, retaining deliberate points on a freeform outline.
function smoothOutline(vertices) {
  const points = []
  for (let i = 0; i < vertices.length; i++) {
    const p = vertices[i], a = vertices.at(i-1), b = vertices[(i+1)%vertices.length]
    const cosine = ((a[0]-p[0])*(b[0]-p[0])+(a[1]-p[1])*(b[1]-p[1]))/(distance(a,p)*distance(b,p))
    if (cosine > -.38) { points.push(p); continue }
    const start = mix(p,a,.36), end = mix(p,b,.36)
    for (let j = 0; j <= 5; j++) points.push(mix(mix(start,p,j/5),mix(p,end,j/5),j/5))
  }
  return [...points,points[0]]
}

export function fitPenContour(points, box) {
  const short = Math.min(box.width,box.height), span = Math.max(box.width,box.height)
  if (points.length < 4 || short < 10 || span < 30) return null
  if (distance(points[0],points.at(-1)) > Math.max(6,Math.min(short*.38,span*.22))) return null
  const gap = distance(points[0],points.at(-1))
  points = trimSeam(points)
  const {four,indices,outline} = corners(points, Math.max(1.3,Math.min(short*.045,span*.026)))
  if (outline.length < 3 || outline.length >= 36) return null
  let boxMatch = rectangleFit(points,four,short)
  // A bowed long edge can contribute a stronger initial split than a real
  // corner of a shallow box. Try adjacent breakpoints on the original arc.
  if (!boxMatch && four && outline.length <= 16) {
    for (let k = 0; k < 4 && !boxMatch; k++) {
      const index = indices.indexOf(four[k])
      for (const next of [indices.at(index-1),indices[(index+1)%indices.length]]) {
        if (four.includes(next)) continue
        const trial = four.slice()
        trial[k] = next
        boxMatch = rectangleFit(points,trial,short)
        if (boxMatch) break
      }
    }
  }
  if (boxMatch) return boxMatch
  const area = outline.reduce((sum,p,i) => sum+cross(points[0],p,outline[(i+1)%outline.length]),0)
  if (Math.abs(area) < box.width*box.height*.40 || crossesItself(outline)) return null
  const star = regularStar(outline,area,box)
  if (star) return {...star, score:star.score+gap/span*.2, allowGroup:gap>span*.08}
  return {tool:'outline',label:'Outline',
    points:smoothOutline(outline),score:.12,confirm:true}
}
