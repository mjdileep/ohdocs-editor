// Movement, a second contact, scrolling, or early release cancels a hold.
export function createPressHold(open,{schedule=setTimeout,unschedule=clearTimeout,delay=550}={}){
  let active,timer
  const cancel=()=>{unschedule(timer);timer=undefined;active=undefined}
  return {
    start(point){
      if(active||point.primary===false){cancel();return}
      active={...point,fired:false}
      timer=schedule(()=>{if(active){active.fired=true;open(active)}},delay)
    },
    move(id,x,y){if(active?.id===id&&Math.hypot(x-active.x,y-active.y)>10)cancel()},
    end(id){if(active?.id!==id)return false;const fired=active.fired;cancel();return fired},
    cancel,
  }
}
