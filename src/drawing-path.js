const inside=(point,box)=>point[0]>=box.left&&point[0]<=box.right&&point[1]>=box.top&&point[1]<=box.bottom

// Clip each pointer segment, rather than clamping outside points onto an edge.
// Leaving and re-entering starts another path, without an artificial connector.
export function clipDrawingSegment(a,b,box){
  let from=0,to=1
  const dx=b[0]-a[0],dy=b[1]-a[1]
  for(const [p,q] of [[-dx,a[0]-box.left],[dx,box.right-a[0]],[-dy,a[1]-box.top],[dy,box.bottom-a[1]]]){
    if(!p){if(q<0)return null;continue}
    const t=q/p
    if(p<0)from=Math.max(from,t);else to=Math.min(to,t)
    if(from>to)return null
  }
  return [[a[0]+from*dx,a[1]+from*dy],[a[0]+to*dx,a[1]+to*dy]]
}

export function drawingPath(limit=4096){
  const segments=[]
  let previous,current,count=0
  const append=point=>{
    if(count>=limit)return
    if(!current){current=[];segments.push(current)}
    const last=current.at(-1)
    if(!last||Math.hypot(point[0]-last[0],point[1]-last[1])>.7){current.push(point);count++}
  }
  return {segments,add(point,box){
    if(!previous){if(inside(point,box))append(point)}
    else{
      const clipped=clipDrawingSegment(previous,point,box)
      if(clipped){append(clipped[0]);append(clipped[1])}
    }
    if(!inside(point,box))current=null
    previous=point
  }}
}

// Only the page and its surrounding gutter arm a drawing gesture. Toolbar
// controls, text fields, links, and other panels keep their own interactions.
export function canStartDrawing(target,overlay,scroller){
  return target===overlay||scroller.contains(target)&&!target.closest('button,a,input,textarea,select,[role="button"],dialog,.fn-draw-tools,.fn-note-chrome')
}
