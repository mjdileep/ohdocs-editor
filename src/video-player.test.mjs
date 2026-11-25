import test from 'node:test'
import assert from 'node:assert/strict'
import { mountVideo } from './video-player.js'

// Small DOM harness for the shared player lifecycle. Browser verification covers
// actual cross-origin focus, ProseMirror selection and native media controls.
function dom(t) {
  class Element extends EventTarget {
    constructor(tag) {
      super();this.tagName=tag.toUpperCase();this.dataset={};this.children=[];this.attributes={}
      const classes=new Set();this.classList={add:name=>classes.add(name),remove:name=>classes.delete(name)}
      if(tag==='video'){this.load=()=>{};this.play=()=>Promise.resolve();this.pause=()=>{this.paused=true}}
    }
    get isConnected(){return this.root||!!this.parent?.isConnected}
    contains(child){return child===this||this.children.some(item=>item.contains(child))}
    append(child){child.parent=this;this.children.push(child)}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);this.parent=null}
    replaceChildren(...children){for(const child of [...this.children])child.remove();for(const child of children)this.append(child)}
    setAttribute(name,value){this.attributes[name]=value}
    hasAttribute(name){return name==='src'?!!this.src:name in this.attributes}
    removeAttribute(name){if(name==='src')delete this.src;delete this.attributes[name]}
  }
  const window=new EventTarget(),document=Object.assign(new EventTarget(),{activeElement:null,createElement:tag=>new Element(tag)}),container=new Element('div')
  container.root=true
  const watched=new Map()
  class IntersectionObserver {
    constructor(callback){this.callback=callback}
    observe(target){this.target=target;watched.set(target,this.callback)}
    disconnect(){watched.delete(this.target)}
    takeRecords(){return []}
  }
  for(const [name,value] of Object.entries({window,document,IntersectionObserver,ResizeObserver:class { observe(){} disconnect(){} },location:{origin:'https://editor.example.test'}})){
    const old=Object.getOwnPropertyDescriptor(globalThis,name)
    Object.defineProperty(globalThis,name,{configurable:true,value})
    t.after(()=>old?Object.defineProperty(globalThis,name,old):delete globalThis[name])
  }
  t.mock.timers.enable({apis:['setTimeout']})
  return {window,document,container,show:surface=>watched.get(surface)?.([{isIntersecting:true}])}
}
const youtube='https://youtu.be/M7lc1UVf-VE'

test('pointer and keyboard interactions select a video without cancelling controls or replacing playback',t=>{
  const {container}=dom(t);let selected=0
  const player=mountVideo(container,youtube,{onSelect:()=>selected++}),surface=container.children[0]
  const press=new Event('pointerdown',{cancelable:true});surface.dispatchEvent(press)
  assert.equal(selected,1);assert.equal(press.defaultPrevented,false)
  const secondary=new Event('pointerdown');secondary.button=2;surface.dispatchEvent(secondary)
  assert.equal(selected,1)
  surface.children.at(-1).dispatchEvent(new Event('click'))
  const frame=surface.children[0]
  assert.equal(new URL(frame.src).origin,'https://www.youtube.com')
  assert.equal(frame.referrerPolicy,'strict-origin')
  surface.dispatchEvent(new Event('click'));surface.dispatchEvent(new Event('focusin'))
  assert.equal(selected,3);assert.equal(surface.children[0],frame)
  player.destroy()
})

test('iframe selection follows settled focus only for the matching live player',t=>{
  const {container,document,window}=dom(t);let first=0,second=0
  const a=mountVideo(container,youtube,{onSelect:()=>first++}),b=mountVideo(container,'https://vimeo.com/76979871',{onSelect:()=>second++})
  const [one,two]=container.children
  one.children.at(-1).dispatchEvent(new Event('click'));two.children.at(-1).dispatchEvent(new Event('click'))
  window.dispatchEvent(new Event('blur'))
  // Chromium settles activeElement after dispatching blur.
  document.activeElement=two.children[0];t.mock.timers.tick(1)
  assert.equal(first,0);assert.equal(second,1)
  window.dispatchEvent(new Event('blur'));document.activeElement=null;t.mock.timers.tick(1)
  assert.equal(second,1,'switching apps or tabs must not select another video')
  document.activeElement=one.children[0];one.children[0].dispatchEvent(new Event('focus'));t.mock.timers.tick(1)
  assert.equal(first,1)
  window.dispatchEvent(new Event('blur'));a.reset();b.destroy();t.mock.timers.tick(1)
  assert.equal(first,1);assert.equal(second,1,'pending focus cannot select a stopped or removed player')
  a.destroy();window.dispatchEvent(new Event('blur'));t.mock.timers.tick(1)
  assert.equal(first,1)
})

test('direct media retains native playback controls and public players need no selection callback',t=>{
  const {container,window}=dom(t)
  const player=mountVideo(container,'https://media.example.test/clip.mp4',{preview:false})
  const surface=container.children[0]
  assert.equal(surface.children.length,1,'only the play control exists before activation')
  surface.children[0].dispatchEvent(new Event('click'))
  const video=surface.children[0]
  assert.equal(video.tagName,'VIDEO');assert.equal(video.controls,true);assert.equal(video.playsInline,true)
  window.dispatchEvent(new Event('blur'));t.mock.timers.tick(1)
  assert.equal(surface.children[0],video)
  player.reset();assert.equal(video.paused,true);assert.equal(video.isConnected,false)
  player.destroy();assert.equal(container.children.length,0)
})

test('editing shields a playing video for movement without recreating or stopping the player',t=>{
  const {container,document}=dom(t);let selected=0,active
  const player=mountVideo(container,youtube,{editable:true,onSelect:()=>selected++,onInteractionChange:value=>{active=value}})
  const surface=container.children[0]
  surface.children.at(-1).dispatchEvent(new Event('click'))
  const [frame,shield]=surface.children
  assert.equal(shield.hidden,true);assert.equal(active,true)
  document.dispatchEvent(new Event('pointerdown'))
  assert.equal(shield.hidden,false);assert.equal(active,false)
  assert.equal(surface.children[0],frame,'clicking outside keeps the exact iframe and its playback position')
  shield.dispatchEvent(new Event('dblclick'))
  assert.equal(shield.hidden,true);assert.equal(selected,1)
  const key=new Event('keydown',{cancelable:true});key.key='Escape';document.dispatchEvent(key)
  assert.equal(shield.hidden,false);assert.equal(key.defaultPrevented,true)
  player.interact(true);assert.equal(shield.hidden,true)
  player.interact(false);assert.equal(shield.hidden,false)
  assert.equal(surface.children[0],frame)
  player.destroy();document.dispatchEvent(new Event('pointerdown'));document.dispatchEvent(key)
  assert.equal(container.children.length,0)
})

test('visible videos get a poster or paused file frame while hidden and disabled previews stay idle',t=>{
  const {container,show}=dom(t)
  for(const url of [youtube,'https://media.example.test/clip.mp4']){
    const player=mountVideo(container,url),surface=container.children[0]
    const [poster,play]=surface.children
    assert.equal(poster.src,undefined)
    show(surface)
    if(url===youtube){
      assert.equal(poster.tagName,'IMG')
      assert.equal(poster.src,'https://i.ytimg.com/vi/M7lc1UVf-VE/hqdefault.jpg')
    }else{
      assert.equal(poster.tagName,'VIDEO');assert.equal(poster.src,url)
      assert.equal(poster.muted,true);assert.equal(poster.preload,'metadata');assert.ok(!poster.autoplay)
      poster.duration=2;poster.dispatchEvent(new Event('loadedmetadata'));assert.equal(poster.currentTime,0.1)
    }
    play.dispatchEvent(new Event('click'))
    assert.equal(poster.isConnected,false)
    player.destroy()
    const privatePlayer=mountVideo(container,url,{preview:false})
    show(container.children[0]);assert.deepEqual(container.children[0].children.map(el=>el.tagName),['BUTTON'])
    privatePlayer.destroy()
  }
})

test('Vimeo uses its own thumbnail, keeps the unlisted hash, and cancels an obsolete lookup',async t=>{
  const {container,show}=dom(t)
  let reply
  const fetchPreview=t.mock.method(globalThis,'fetch',()=>new Promise(resolve=>{reply=resolve}))
  const player=mountVideo(container,'https://vimeo.com/76979871/abc123')
  const surface=container.children[0],poster=surface.children[0]
  assert.equal(fetchPreview.mock.callCount(),0)
  show(surface)
  const [url,options]=fetchPreview.mock.calls[0].arguments
  assert.equal(url.origin+url.pathname,'https://vimeo.com/api/oembed.json')
  assert.equal(url.searchParams.get('url'),'https://vimeo.com/76979871/abc123')
  assert.equal(options.credentials,'omit')
  reply({ok:true,json:async()=>({thumbnail_url:'https://i.vimeocdn.com/video/123.jpg'})})
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(poster.src,'https://i.vimeocdn.com/video/123.jpg')
  player.reset();const late=surface.children[0];show(surface)
  surface.children.at(-1).dispatchEvent(new Event('click'))
  assert.equal(fetchPreview.mock.calls[1].arguments[1].signal.aborted,true)
  reply({ok:true,json:async()=>({thumbnail_url:'https://i.vimeocdn.com/video/456.jpg'})})
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(late.src,undefined);assert.equal(surface.children[0].tagName,'IFRAME')
  player.destroy()
})
