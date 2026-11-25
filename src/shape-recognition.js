// Match a single continuous stroke against the same outlines the palette draws.
// Equal-distance sampling makes speed, direction and starting corner immaterial.
import { shapePoints } from './drawing-shapes.js'
import { compactPenPoints, fitPenContour } from './pen-contour.js'

const samples = 48
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const rotate = ([x, y], angle) => [
  x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle),
]
function bounds(points) {
  const xs = points.map(p => p[0]), ys = points.map(p => p[1])
  const left = Math.min(...xs), top = Math.min(...ys)
  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top }
}

function measure(points) {
  let length = 0
  const stops = [0]
  for (let i = 1; i < points.length; i++) {
    length += distance(points[i], points[i - 1])
    stops.push(length)
  }
  return { length, stops }
}

function resample(points, count, closed = false) {
  const { length, stops } = measure(points)
  let end = 1
  return Array.from({length: count}, (_, i) => {
    const at = length * i / (closed ? count : count - 1)
    while (end < stops.length - 1 && stops[end] < at) end++
    const t = (at - stops[end - 1]) / (stops[end] - stops[end - 1] || 1)
    return points[end].map((v, axis) => points[end - 1][axis] + t * (v - points[end - 1][axis]))
  })
}

// Keep nearby-stroke search bounded on highly sampled stylus input. The raw
// points stay in the document and are restored verbatim by undo.
export const recognitionSamples = points => points.length > 192 ? compactPenPoints(points,192) || resample(points,192) : points

function normalized(points, box) {
  return points.map(([x, y]) => [(x - box.left) / box.width, (y - box.top) / box.height])
}

// Penalize a local detour (e.g. a loop in handwriting), even if most of the
// stroke agrees. Stop comparing as soon as this fit can't beat the best one.
function fit(ink, model, closed) {
  let best = Infinity
  for (const direction of [1, -1]) {
    const starts = closed ? samples : 1
    for (let i = 0; i < starts; i++) {
      const start = closed || direction === 1 ? i : samples - 1
      if (distance(ink[0], model[start]) > .26) continue
      let sum = 0, peak = 0
      for (let j = 0; j < samples; j++) {
        const [x, y] = model[(start + direction * j + samples) % samples]
        const error = (ink[j][0] - x) ** 2 + (ink[j][1] - y) ** 2
        sum += error
        peak = Math.max(peak, error)
        if (sum / samples + peak * .18 >= best) break
        if (j === samples - 1) best = sum / samples + peak * .18
      }
    }
  }
  return Math.sqrt(best)
}

// Compare both axes in the user's own bounding rectangle. Equivalent square
// and circle proportions are handled when constructing the fitted outline.
const closedModels = []
function addModel(tool, points, penalty = 0) {
  const outline = normalized(points, bounds(points))
  closedModels.push({ tool, outline, samples: resample(outline, samples, true), penalty, length: measure(outline).length })
}
for (const [tool, penalty = 0] of [
  ['rectangle'], ['ellipse'], ['triangle'], ['diamond'], ['right-triangle'], ['heart'],
  ['rounded-rectangle', .012], ['parallelogram', .008], ['trapezoid', .008],
  ['pentagon', .01], ['hexagon', .014], ['octagon', .018], ['star'], ['star4'], ['star6'],
  ['cross'], ['chevron'], ['right-arrow'], ['left-arrow'], ['up-arrow'], ['down-arrow'],
  ['left-right-arrow'], ['up-down-arrow'], ['notched-arrow'], ['speech-bubble'], ['cloud'],
]) {
  const points = shapePoints(tool, [0, 0], [100, 100])
  addModel(tool, points, penalty)
  if (['triangle', 'right-triangle', 'heart', 'speech-bubble'].includes(tool)) {
    for (const angle of [Math.PI / 2, Math.PI, -Math.PI / 2]) addModel(tool, points.map(p => rotate(p, angle)), penalty)
  }
}
// A star is often sketched by crossing the centre in one continuous gesture.
const star = shapePoints('star', [0, 0], [100, 100])
addModel('star', [0, 4, 8, 2, 6, 0].map(index => star[index]))

function closedMatch(points) {
  const contour = [...points, points[0]]
  const uniform = resample(contour, samples, true)
  // Estimate tilt from the dominant perpendicular edges, and from the principal
  // axis for elongated ellipses. Prefer an upright fit when equally plausible.
  const center = [0, 1].map(axis => uniform.reduce((sum, p) => sum + p[axis], 0) / samples)
  let edgeX = 0, edgeY = 0, covariance = 0, varianceDifference = 0
  uniform.forEach(([x, y], i) => {
    const next = uniform[(i + 1) % samples]
    const angle = Math.atan2(next[1] - y, next[0] - x)
    edgeX += Math.cos(angle * 4); edgeY += Math.sin(angle * 4)
    covariance += (x - center[0]) * (y - center[1])
    varianceDifference += (x - center[0]) ** 2 - (y - center[1]) ** 2
  })
  const tilt = Math.atan2(edgeY, edgeX) / 4
  const principal = Math.atan2(2 * covariance, varianceDifference) / 2
  let best, threshold = .086
  for (const [angle, ellipseOnly] of [[0, false], [tilt, false], [principal, true]]) {
    if (angle !== 0 && Math.abs(angle) < .045) continue
    const frame = contour.map(p => rotate(p, -angle)), box = bounds(frame)
    if (Math.min(box.width, box.height) < 16) continue
    const scaled = normalized(frame, box), ink = resample(scaled, samples, true)
    const length = measure(scaled).length
    for (const model of closedModels) {
      if (ellipseOnly && model.tool !== 'ellipse') continue
      if (Math.abs(length / model.length - 1) > .26) continue
      const score = fit(ink, model.samples, true) + model.penalty + (angle ? .009 : 0)
      if (score >= threshold) continue
      threshold = score
      const nearlyEqual = Math.abs(box.width - box.height) <= .09 * Math.max(box.width, box.height)
      const label = nearlyEqual && { ellipse: 'Circle', rectangle: 'Square' }[model.tool]
      const width = label ? (box.width + box.height) / 2 : box.width
      const height = label ? width : box.height
      best = { score, tool: model.tool, label: label || undefined, points: model.outline.map(([x,y]) =>
        rotate([box.left + box.width / 2 + (x - .5) * width, box.top + box.height / 2 + (y - .5) * height], angle)) }
    }
  }
  return best
}

const openOutlines = ['bracket', 'brace', 'cylinder', 'cube'].map(tool => {
  const points = shapePoints(tool, [0, 0], [100, 100])
  return {tool, outline: normalized(points, bounds(points))}
})

function openMatch(points, span, length) {
  const start = points[0], end = points.at(-1), chord = distance(start, end)
  if (chord > 32 && length < chord * 1.1) {
    const deviations = points.map(([x, y]) => Math.abs((x - start[0]) * (end[1] - start[1]) - (y - start[1]) * (end[0] - start[0])) / chord)
    if (Math.max(...deviations) < Math.max(2, chord * .045)) return { tool: 'line', points: [start, end] }
  }
  let best, threshold = .049
  // Work at a fixed resolution from here, even for a long stylus gesture.
  const ink = resample(points, samples).map(([x,y]) => [x / span, y / span])
  function consider(tool, outline, penalty = 0) {
    const candidateLength = measure(outline).length
    if (Math.abs(length - candidateLength) > .19 * candidateLength) return
    const model = resample(outline, samples).map(([x,y]) => [x / span, y / span])
    const score = fit(ink, model, false) + penalty
    if (score < threshold) { threshold = score; best = { tool, points: outline } }
  }
  const box = bounds(points)
  if (Math.min(box.width, box.height) > 16 && length > span * 1.45) {
    for (const {tool, outline} of openOutlines) {
      for (const mirror of [false, true]) {
        consider(tool, outline.map(([x,y]) => [
          box.left + box.width * (mirror ? 1-x : x), box.top + box.height * y,
        ]), .008)
      }
    }
  }
  if (chord >= 32 && length < 1.65 * chord) {
    // Preserve the side and depth of a hand-drawn curve relative to its chord.
    const dx = end[0] - start[0], dy = end[1] - start[1]
    const offsets = points.map(([x,y]) => ((y-start[1])*dx - (x-start[0])*dy) / chord)
    const low = Math.min(...offsets), high = Math.max(...offsets)
    const bend = Math.abs(low) > high ? low : high
    if (Math.abs(bend) > chord * .085 && Math.min(-low, high) < Math.abs(bend) * .12) {
      const curve = shapePoints('curve', [0,0], [100,0])
      const outline = curve.map(([x,y]) => [
        start[0] + dx*x/100 - dy/chord*y*bend/22.5,
        start[1] + dy*x/100 + dx/chord*y*bend/22.5,
      ])
      consider('curve', outline, .012)
    }
    if (Math.min(-low, high) > chord * .055) {
      for (const direction of [1,-1]) {
        const wave = shapePoints('wave', [0,0], [100,0])
        consider('wave', wave.map(([x,y]) => [
          start[0] + dx*x/100 - dy/chord*y*(high-low)/20*direction,
          start[1] + dy*x/100 + dx/chord*y*(high-low)/20*direction,
        ]), .008)
      }
    }
    if (Math.min(Math.abs(dx), Math.abs(dy)) > chord * .18) {
      consider('elbow-line', [start, [start[0], end[1]], end])
      consider('elbow-line', [start, [end[0], start[1]], end])
    }
  }

  // The farthest point from the tail is the tip. Require ink on both sides
  // of the shaft so a hook or a handwritten V can't become a straight arrow.
  for (const tail of [start, end]) {
    const tip = points.reduce((far, p) => distance(tail, p) > distance(tail, far) ? p : far, tail)
    const shaft = distance(tail, tip)
    if (length < shaft * 1.12 || length > shaft * 4.7) continue
    const sides = points.map(([x,y]) => ((x-tail[0])*(tip[1]-tail[1])-(y-tail[1])*(tip[0]-tail[0])) / shaft)
    const left = Math.min(...sides), right = Math.max(...sides)
    const wingRatio = distance(tip, tail === start ? end : start) / shaft
    for (const ratio of [.06, .12, .22, .32, .42, Math.min(.45, wingRatio)]) {
      if (length > shaft * 2 && chord < shaft * .55) {
        consider('double-arrow', shapePoints('double-arrow', tail, tip, {size: shaft * ratio / 3.5}))
        continue
      }
      for (const tool of ['arrow', 'elbow-arrow', 'curved-arrow']) {
        if (tool === 'arrow' && Math.min(-left, right) < shaft * ratio * .22) continue
        const arrow = shapePoints(tool, tail, tip, { size: shaft * ratio / 3.5 })
        consider(tool, arrow)
        // Either wing may be drawn first, followed by a return to the tip.
        const reversedHead = [...arrow]
        const last = reversedHead.length - 1
        reversedHead[last - 2] = arrow[last]
        reversedHead[last] = arrow[last - 2]
        consider(tool, reversedHead)
      }
    }
  }
  return best
}

export function recognizeShape(points) {
  if (!points || points.length < 2 || points.length > 4096) return null
  const box = bounds(points), span = Math.max(box.width, box.height)
  if (span < 34) return null
  const { length } = measure(points)
  const gap = distance(points[0], points.at(-1))
  if (gap < span * .23 && length > span * 1.9) {
    const closed = closedMatch(points)
    if (closed) return closed
  }
  return openMatch(points, span, length) || null
}

// A second matcher compares the ink on the page, independent of traversal.
// Both distances matter: the ink must follow the model AND cover its outline.
// The latter keeps a three-sided box or two parallel lines from becoming a box.
const cloudModels = closedModels.map(model => {
  const sorted = axis => model.samples.map(p => p[axis]).sort((a,b) => a-b)
  const xs = sorted(0), ys = sorted(1)
  const inner = [xs[2], ys[2], xs[samples-3]-xs[2], ys[samples-3]-ys[2]]
  const target = model.samples.map(([x,y]) => [(x-inner[0])/inner[2], (y-inner[1])/inner[3]])
  return {...model, inner, target}
})
const commonTools = new Set(['rectangle', 'ellipse', 'diamond', 'triangle', 'right-triangle'])
function closestSquared([x,y], cloud) {
  let best = Infinity
  for (const p of cloud) {
    const dx = p[0]-x, dy = p[1]-y
    best = Math.min(best, dx*dx + dy*dy)
  }
  return best
}

// Bound the influence of one overshooting corner, but require every component
// to follow the outline. Also measure in the other direction to reject an
// incomplete contour even if all its existing ink lies on the model.
function outlineError(ink, parts, target) {
  let offset = 0, outside = 0, inkError = 0
  for (const part of parts) {
    let supported = 0
    for (let i = 0; i < part.length; i++) {
      const error = closestSquared(ink[offset++], target)
      if (error < .11 ** 2) supported++
      if (error > .18 ** 2) outside++
      inkError += Math.min(error, .15 ** 2)
    }
    if (supported < part.length * .62) return Infinity
  }
  if (outside > ink.length * .09) return Infinity

  let missing = 0, coverageError = 0
  for (const point of target) {
    const error = closestSquared(point, ink)
    if (error > .23 ** 2) return Infinity
    if (error > .105 ** 2) missing++
    coverageError += error
  }
  if (missing > 6) return Infinity
  return Math.sqrt((inkError / ink.length + coverageError / target.length) / 2)
}

// A triangle's longest side lies between its two furthest corners. The
// furthest point from that side gives the third corner, even for a scalene
// triangle tilted at an angle absent from the palette templates.
function triangleOutline(parts, all, box, length) {
  let a, b, longest = 0
  for (let i = 0; i < all.length; i++) {
    for (let j = 0; j < i; j++) {
      const dx = all[i][0] - all[j][0], dy = all[i][1] - all[j][1]
      const squared = dx*dx + dy*dy
      if (squared > longest) {
        longest = squared
        a = all[i]
        b = all[j]
      }
    }
  }
  const dx = b[0] - a[0], dy = b[1] - a[1]
  let c, area = 0
  for (const p of all) {
    const cross = Math.abs(dx*(p[1]-a[1]) - dy*(p[0]-a[0]))
    if (cross > area) { c = p; area = cross }
  }
  if (area < box.width * box.height * .3) return null
  const points = [a,b,c,a], perimeter = measure(points).length
  if (length < perimeter * .8 || length > perimeter * 1.35) return null
  const ink = normalized(all, box), corners = normalized(points, box)
  const score = outlineError(ink, parts, resample(corners, samples, true))
  if (score > .055) return null
  // All three sides must actually be present, including a short third side.
  for (let i = 0; i < 3; i++) {
    const midpoint = corners[i].map((v, axis) => (v + corners[i+1][axis]) / 2)
    if (closestSquared(midpoint, ink) > .08 ** 2) return null
  }
  const cosine = ((a[0]-c[0])*(b[0]-c[0]) + (a[1]-c[1])*(b[1]-c[1])) / (distance(a,c)*distance(b,c))
  return {tool: Math.abs(cosine) < .055 ? 'right-triangle' : 'triangle', points, score}
}

function spatialOutline(paths) {
  const lengths = paths.map(path => measure(path).length)
  const total = lengths.reduce((sum, n) => sum+n, 0)
  if (total < 34 || lengths.some(length => length === 0)) return null
  const parts = paths.map((p,i) => resample(p, Math.max(5, Math.round(80*lengths[i]/total))))
  const all = parts.flat(), raw = bounds(all)
  if (Math.max(raw.width,raw.height) < 32 || Math.min(raw.width,raw.height) < 13) return null
  let edgeX = 0, edgeY = 0
  for (const part of parts) for (let i=1; i<part.length; i++) {
    const a=part[i-1], b=part[i], weight=distance(a,b)
    const angle=4*Math.atan2(b[1]-a[1],b[0]-a[0])
    edgeX += weight*Math.cos(angle); edgeY += weight*Math.sin(angle)
  }
  const tilt = Math.atan2(edgeY,edgeX)/4
  let best = triangleOutline(parts, all, raw, total)
  for (const angle of Math.abs(tilt) > .07 ? [0,tilt] : [0]) {
    const frame = all.map(p => rotate(p,-angle))
    const trim = Math.floor(frame.length*.045)
    const limits = axis => {
      const values = frame.map(p=>p[axis]).sort((a,b)=>a-b)
      return [values[trim],values[values.length-1-trim]]
    }
    const [x,right] = limits(0), [y,bottom] = limits(1)
    const width = right-x, height = bottom-y
    if (Math.min(width,height) < 12 || total < 1.47*(width+height)) continue
    const ink = frame.map(p=>[(p[0]-x)/width,(p[1]-y)/height])
    for (const model of cloudModels) {
      const [mx,my,mw,mh] = model.inner
      const w=width/mw, h=height/mh
      const perimeter = model.outline.reduce((sum,p,i,outline) => i
        ? sum+Math.hypot((p[0]-outline[i-1][0])*w,(p[1]-outline[i-1][1])*h) : sum, 0)
      if (total < perimeter*.76 || total > perimeter*1.44) continue
      const score = outlineError(ink, parts, model.target) + model.penalty * .65
        + (commonTools.has(model.tool) ? 0 : .011) + (angle ? .005 : 0)
      if (score > .088 || (best && best.score <= score)) continue
      const nearSquare = Math.abs(w-h) < Math.max(w,h)*.105
      const label = nearSquare && {ellipse:'Circle',rectangle:'Square'}[model.tool]
      const fitW = label ? (w+h)/2 : w, fitH = label ? fitW : h
      best = {score,tool:model.tool,label:label||undefined,points:model.outline.map(([px,py])=>
        rotate([x-mx*w+w/2+(px-.5)*fitW,y-my*h+h/2+(py-.5)*fitH],angle))}
    }
  }
  return best || null
}

// Join only at nearby ends for open connectors. A separately drawn arrowhead
// also has a junction in its middle, which need not be an endpoint.
function groupArrow(paths) {
  if (paths.length > 3) return null
  for (const shaft of paths) {
    const ends = [shaft[0],shaft.at(-1)], span=distance(...ends)
    if (span < 28 || measure(shaft).length > span*1.09) continue
    const wings=paths.filter(p=>p!==shaft)
    for (const tip of ends) {
      const tail=tip===ends[0]?ends[1]:ends[0], dx=(tail[0]-tip[0])/span, dy=(tail[1]-tip[1])/span
      const reach = Math.max(6,span*.095)
      if (wings.some(p=>resample(p,24).every(q=>distance(q,tip)>reach))) continue
      const vertices=wings.flatMap(p=>[p[0],p.at(-1)]).filter(p=>distance(p,tip)>reach*.65)
      const wingspan=vertices.map(p=>{
        const x=p[0]-tip[0],y=p[1]-tip[1]
        return {back:x*dx+y*dy,side:x*dy-y*dx,length:Math.hypot(x,y)}
      })
      if (wingspan.length!==2 || wingspan[0].side*wingspan[1].side>=0) continue
      if (wingspan.some(v=>v.length>span*.55 || v.back<=0 || Math.abs(v.side)<v.length*.22 || Math.abs(v.side)>v.length*.9)) continue
      const [a,b]=wingspan
      if (Math.min(a.length,b.length)<Math.max(a.length,b.length)*.4) continue
      const head=(a.length+b.length)/2
      if (wings.reduce((sum,p)=>sum+measure(p).length,0)>3*head+reach) continue
      return {tool:'arrow',points:shapePoints('arrow',tail,tip,{size:head/3.5}),score:.045}
    }
  }
  return null
}

function joinEnds(paths) {
  let chains=paths.slice()
  const {width,height}=bounds(paths.flat())
  const tolerance=Math.min(32,Math.max(8,.14*Math.max(width,height)))
  while (chains.length>1) {
    let best
    for(let i=0;i<chains.length;i++) for(let j=i+1;j<chains.length;j++) {
      for(const reverseA of [false,true]) for(const reverseB of [false,true]) {
        const d=distance(chains[i].at(reverseA?0:-1),chains[j].at(reverseB?-1:0))
        if(d<=tolerance && (!best || d<best.d)) best={i,j,reverseA,reverseB,d}
      }
    }
    if(!best) return null
    const {i,j,reverseA,reverseB}=best
    const a=chains[i], b=chains[j]
    chains=chains.filter((_,k)=>k!==i && k!==j)
    chains.push([...(reverseA?[...a].reverse():a),...(reverseB?[...b].reverse():b)])
  }
  return chains[0]
}

export function recognizeStrokes(paths) {
  if (!paths.length || paths.some(p => p.length < 2 || p.length > 4096)) return null
  const single = paths.length === 1
  const ordered = single ? paths[0] : joinEnds(paths)
  const template = ordered && recognizeShape(ordered)
  if (template && (template.score ?? (single ? 0 : Infinity)) < .028) {
    return {...template, score: template.score ?? .045}
  }
  if (!single) {
    const arrow = groupArrow(paths)
    if (arrow) return arrow
  }
  const rough = ordered && fitPenContour(recognitionSamples(ordered), bounds(ordered))
  const match = template || spatialOutline(paths)
  // A short hook on a box is easily mistaken for the tail of a callout.
  // Use the four measured sides unless the specific template is convincing.
  if (rough?.tool === 'rectangle' && (!match || match.tool === 'speech-bubble' ||
      ['rectangle','parallelogram','trapezoid'].includes(match.tool) && match.score > .063)) return rough
  if (rough && !rough.confirm && (!match || match.score > .067)) return rough
  if (match) return {...match, score: match.score ?? .075,
    confirm: match.score > .045 && !commonTools.has(match.tool) || match.tool === 'speech-bubble'}
  return rough || null
}
