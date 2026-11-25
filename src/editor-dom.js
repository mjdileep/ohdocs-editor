const depth = new WeakMap()
export function quietly(view, work) {
  const observer=view.domObserver, count=depth.get(view)||0
  if (!count) observer?.stop?.()
  depth.set(view,count+1)
  try {return work()} finally {
    depth.set(view,count)
    if (!count) observer?.start?.()
  }
}
