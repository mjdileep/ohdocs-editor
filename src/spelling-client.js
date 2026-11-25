export function createSpellingClient({url,WorkerClass=globalThis.Worker,timeoutMs=8000,idleMs=120000}){
  let worker,sequence=0,idle
  const pending=new Map()
  function dispose(){
    clearTimeout(idle)
    worker?.terminate();worker=undefined
    for(const {reject,timer} of pending.values()){clearTimeout(timer);reject(new Error('Spelling unavailable'))}
    pending.clear()
  }
  function check(word){
    clearTimeout(idle)
    return new Promise((resolve,reject)=>{
      try{
        if(!worker){
          worker=new WorkerClass(url,{type:'module'})
          worker.onerror=event=>{event.preventDefault();dispose()}
          worker.onmessage=({data})=>{
            const request=pending.get(data.id)
            if(!request)return
            pending.delete(data.id);clearTimeout(request.timer)
            if(data.error)request.reject(new Error('Spelling unavailable'))
            else request.resolve(data.result)
            if(!pending.size)idle=setTimeout(dispose,idleMs)
          }
        }
        const id=++sequence,timer=setTimeout(dispose,timeoutMs)
        pending.set(id,{resolve,reject,timer})
        worker.postMessage({id,word})
      }catch(error){dispose();reject(error)}
    })
  }
  return {check,dispose}
}
