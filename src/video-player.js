import { videoSource, videoFrameURL } from '../format/video.mjs'

const playIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 11 7-11 7Z" fill="currentColor"/></svg>'
// Load just the preview when the video comes into view, including when its
// enclosing section is expanded. Never mount a provider player before Play.
function mountPreview(surface, source) {
  const file = source.provider === 'file'
  const poster = document.createElement(file ? 'video' : 'img')
  const request = source.provider === 'vimeo' ? new AbortController() : null
  poster.className = 'fn-video-poster'
  poster.draggable = false
  poster.setAttribute('aria-hidden', 'true')
  poster.addEventListener('error', () => poster.remove(), {once:true})
  if (file) {
    poster.muted = true
    poster.playsInline = true
    poster.preload = 'metadata'
    poster.addEventListener('loadedmetadata', () => {
      if (!new URL(source.url).hash && poster.duration > 0) poster.currentTime = Math.min(0.1, poster.duration / 2)
    }, {once:true})
  } else {
    poster.alt = ''
    poster.referrerPolicy = 'no-referrer'
  }
  surface.append(poster)

  async function load() {
    if (!request) {
      poster.src = file ? source.url : source.poster
      return
    }
    const endpoint = new URL('https://vimeo.com/api/oembed.json')
    endpoint.searchParams.set('url', source.url.split('#')[0])
    endpoint.searchParams.set('width', '640')
    try {
      const response = await fetch(endpoint, {signal:request.signal, credentials:'omit', referrerPolicy:'no-referrer', redirect:'error'})
      if (!response.ok) return
      const {thumbnail_url} = await response.json()
      const image = new URL(thumbnail_url)
      if (!request.signal.aborted && image.origin === 'https://i.vimeocdn.com' && !image.username && !image.password) poster.src = image.href
    } catch { /* The Play button still works when a preview is unavailable. */ }
  }

  const visible = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      visible.disconnect()
      load()
    }
  })
  visible.observe(surface)
  return () => {
    visible.disconnect()
    visible.takeRecords()
    request?.abort()
    poster.remove()
    if (file && poster.hasAttribute('src')) {
      poster.removeAttribute('src')
      poster.load()
    }
  }
}

// Shared by the editor and public reader. Placement updates never replace the
// live player, so moving or resizing a playing video does not restart it.
export function mountVideo(container, input, { preview = true, onSelect, editable=false, onInteractionChange } = {}) {
  const source = videoSource(input)
  if (!source) return null
  const surface = document.createElement('div')
  surface.className='fn-video-surface';surface.dataset.ratio=source.ratio;surface.dataset.provider=source.provider
  container.append(surface)
  let media, playerBox, observer, clearPreview, closed=false, focusTimer, interacting=false
  const shield=editable?document.createElement('div'):null
  if(shield){
    shield.className='fn-video-move-surface'
    shield.title='Drag to move. Double-click to use player controls.'
    shield.addEventListener('dblclick',event=>{event.preventDefault();event.stopPropagation();interact(true)})
  }
  const interaction=active=>{
    interacting=!!active
    if(shield)shield.hidden=interacting
    onInteractionChange?.(interacting)
  }
  // While arranging the page the whole video is a move surface, even when it
  // is playing. Entering the player hands every gesture back to its controls.
  // Clicking outside returns to arranging without unloading or pausing media.
  const outside=event=>{if(!container.contains(event.target))interaction(false)}
  const key=event=>{if(event.key==='Escape'&&interacting){interaction(false);select();event.preventDefault()}}
  if(editable){document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',key,true)}
  const select=()=>{if(!closed)onSelect?.()}
  // Native controls keep their pointer/keyboard behavior. Selecting the editor
  // atom must never focus the editor or replace a playing media element.
  const pointer=event=>{if(!event.button&&event.isPrimary!==false)select()}
  if(onSelect){
    surface.addEventListener('pointerdown',pointer,true)
    surface.addEventListener('click',select,true)
    surface.addEventListener('focusin',select)
  }
  // Cross-origin iframe clicks do not bubble into our document. The browser
  // instead focuses the iframe and blurs this window; activeElement settles on
  // the next task. Check this exact player, never an unrelated window/tab blur.
  const frameFocus=()=>{
    clearTimeout(focusTimer)
    focusTimer=setTimeout(()=>{
      if(media?.tagName==='IFRAME'&&media.isConnected&&document.activeElement===media)select()
    },0)
  }
  if(onSelect)window.addEventListener('blur',frameFocus)
  const providerRatio = source.ratio === 'portrait' ? 9/16 : 16/9
  const fitPlayer = () => {
    if (!playerBox || !surface.clientWidth || !surface.clientHeight) return
    const width = Math.max(surface.clientWidth,200,200*providerRatio), height = width/providerRatio
    Object.assign(playerBox.style,{width:width+'px',height:height+'px',
      transform:'scale('+surface.clientWidth/width+','+surface.clientHeight/height+')'})
  }
  const appendMedia = element => {
    surface.append(element)
    if (source.provider === 'file') return
    playerBox = element
    playerBox.classList.add('fn-video-viewport')
    observer ||= new ResizeObserver(fitPlayer)
    observer.observe(surface)
    fitPlayer()
  }
  const reset=()=>{
    if(closed)return
    clearTimeout(focusTimer)
    media?.pause?.();media?.remove();media=null
    interaction(false)
    surface.classList.remove('is-playing');surface.replaceChildren();playerBox=null
    clearPreview?.()
    clearPreview = preview ? mountPreview(surface,source) : null
    const play=document.createElement('button')
    play.type='button';play.className='fn-video-play';play.title='Play video';play.setAttribute('aria-label','Play video');play.innerHTML=playIcon
    play.addEventListener('click',event=>{event.stopPropagation();start()});surface.append(play)
  }
  const start=()=>{
    if(closed||media)return
    clearPreview?.();clearPreview=null
    media=document.createElement(source.provider==='file'?'video':'iframe')
    if(source.provider==='file'){
      media.addEventListener('loadedmetadata',event=>{
        const {videoWidth,videoHeight}=event.currentTarget
        if(videoWidth&&videoHeight)surface.style.setProperty('--fn-video-ratio',videoWidth/videoHeight)
      })
      media.controls=true;media.playsInline=true;media.preload='none';media.autoplay=true
      media.addEventListener('error',()=>{
        reset()
        const message=document.createElement('span');message.className='fn-video-error';message.textContent='Video unavailable. Try again.';surface.append(message)
      },{once:true})
    }else{
      media.title='Video player';media.allow='autoplay; encrypted-media; fullscreen; picture-in-picture';media.allowFullscreen=true
      media.setAttribute('sandbox','allow-scripts allow-same-origin allow-presentation')
      if(onSelect)media.addEventListener('focus',frameFocus)
      // Providers need the embedding origin, never the note URL or public token.
      media.referrerPolicy='strict-origin'
    }
    media.src=videoFrameURL(source,location.origin)
    surface.replaceChildren();appendMedia(media);surface.classList.add('is-playing')
    if(shield)surface.append(shield)
    interaction(true)
    media.play?.().catch(()=>{})
  }
  const interact=active=>{
    if(closed)return
    if(active&&!media)start()
    else interaction(active)
    if(active){select();media?.focus?.()}
  }
  reset()
  return { reset, interact, get interacting(){return interacting}, destroy(){
    closed=true;clearTimeout(focusTimer)
    if(onSelect)window.removeEventListener('blur',frameFocus)
    if(editable){document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',key,true)}
    clearPreview?.();observer?.disconnect();media?.pause?.();media?.remove();surface.remove()
  } }
}
