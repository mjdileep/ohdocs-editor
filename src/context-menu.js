import {icon} from './icons.js'
import {createPressHold} from './press-hold.js'

// Context menus belong to the signed-in workspace. Text fields and touch text
// selection retain the platform's editing menu and accessibility behavior.
export function createContextMenu({root,resolve,beforeOpen,esc,isEnabled,onOpen}){
  const listeners=new AbortController(), {signal}=listeners
  const menu=document.createElement('div')
  menu.className='fn-popover fn-context-menu'
  menu.setAttribute('role','menu')
  menu.hidden=true
  root.append(menu)
  let actions=[],anchor,previousFocus,suppressClickUntil=0,touchUntil=0,releaseMenu,version=0
  const markup=(items,offset=0)=>items.map((item,index)=>item.separator?'<hr role="separator">':`<button type="button" role="menuitem" tabindex="-1" data-context-index="${offset+index}" ${item.disabled?'disabled':''} class="${item.danger?'fn-context-danger':''}">${item.icon?icon(item.icon):''}<span>${esc(item.label)}</span>${item.hint?`<kbd>${esc(item.hint)}</kbd>`:''}</button>`).join('')
  const editable=target=>target.closest('input,textarea,select,[contenteditable="true"],.tiptap')
  const enabled=target=>(isEnabled?isEnabled():!root.querySelector('.fn-app').hidden)&&root.contains(target)&&!target.closest('.fn-public-page')
  function close(restore=false){
    version++
    if(menu.hidden)return
    releaseMenu?.();releaseMenu=undefined
    menu.hidden=true
    anchor?.classList.remove('fn-context-target')
    // Focus goes back to the right-clicked control. An object inside an editor
    // cannot take focus, so the editor does: its selection keeps answering keys.
    const focusable=element=>!element?.isConnected?null:element.matches('button,a[href],input,select,textarea,[tabindex]')?element:element.closest('[contenteditable="true"]')
    const focus=focusable(anchor)||previousFocus
    if(restore&&focus?.isConnected)focus.focus({preventScroll:true})
    actions=[];anchor=undefined
  }
  function open(target,x,y,source='mouse'){
    if(!enabled(target)||menu.contains(target))return false
    const spec=resolve(target,{x,y,source})
    if(!spec?.items?.length)return false
    close();beforeOpen()
    anchor=spec.anchor||target.closest('button')||target
    previousFocus=document.activeElement
    anchor.classList.add('fn-context-target')
    const host=target.closest('dialog[open]')||root
    host.append(menu)
    actions=spec.items
    menu.setAttribute('aria-label',spec.label||'Actions')
    menu.innerHTML=(spec.hideLabel?'':`<div class="fn-menu-label">${esc(spec.label||'Actions')}</div>`)+markup(actions)
    menu.hidden=false
    releaseMenu=onOpen?.(()=>close(true))
    const place=()=>{
    const viewport=window.visualViewport
    const left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0,width=viewport?.width||innerWidth,height=viewport?.height||innerHeight
    menu.style.maxHeight=Math.max(80,height-16)+'px'
    menu.style.left=Math.max(left+8,Math.min(x,left+width-menu.offsetWidth-8))+'px'
    menu.style.top=Math.max(top+8,Math.min(y,top+height-menu.offsetHeight-8))+'px'
    }
    if(spec.leadingItems){
      const requestVersion=version,leading=document.createElement('div')
      leading.setAttribute('role','group');leading.setAttribute('aria-label','Spelling suggestions')
      leading.innerHTML='<div class="fn-context-status" role="status">Checking spelling…</div><hr role="separator">'
      menu.prepend(leading)
      Promise.resolve(spec.leadingItems).then(items=>{
        if(menu.hidden||version!==requestVersion)return
        if(!items.length){leading.remove();place();return}
        // Leave existing buttons intact: late suggestions must not steal focus
        // or change the action under a keyboard user.
        const offset=actions.length
        actions=actions.concat(items)
        leading.innerHTML=markup(items,offset)+'<hr role="separator">'
        place()
      },()=>{if(version===requestVersion){leading.remove();place()}})
    }
    place()
    menu.querySelector('button:not(:disabled)')?.focus({preventScroll:true})
    return true
  }
  const hold=createPressHold(({target,x,y})=>{
    if(open(target,x,y,'touch'))suppressClickUntil=Date.now()+1200
  })
  // The custom menu owns secondary clicks. Letting ProseMirror start its mouse
  // selection here can refocus the editor on release and instantly close it.
  root.addEventListener('mousedown',event=>{
    const secondary=event.button===2||event.button===0&&event.ctrlKey&&/Mac|iPhone|iPad/.test(navigator.platform)
    if(secondary&&enabled(event.target)&&event.target.closest('.tiptap')&&!event.target.closest('input,textarea,select'))event.preventDefault()
  },true)
  root.addEventListener('contextmenu',event=>{
    const target=event.target
    if(!enabled(target))return
    if(target.closest('input,textarea,select'))return
    // iOS/Android need native text selection, copy/paste, and selection handles.
    if((event.pointerType==='touch'||Date.now()<touchUntil)&&editable(target))return
    event.preventDefault()
    if(menu.contains(target)||Date.now()<suppressClickUntil)return
    hold.cancel()
    const rect=target.getBoundingClientRect(),keyboard=event.clientX===0&&event.clientY===0
    open(target,keyboard?rect.left+12:event.clientX,keyboard?rect.bottom:event.clientY,keyboard?'keyboard':'mouse')
  })
  root.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse')return
    touchUntil=Date.now()+1500
    if(!enabled(event.target)||editable(event.target)||menu.contains(event.target)||event.target.closest('a')){hold.cancel();return}
    hold.start({id:event.pointerId,target:event.target,x:event.clientX,y:event.clientY,primary:event.isPrimary})
  },{passive:true})
  root.addEventListener('pointermove',event=>hold.move(event.pointerId,event.clientX,event.clientY),{passive:true})
  root.addEventListener('pointerup',event=>{
    if(hold.end(event.pointerId)){event.preventDefault();suppressClickUntil=Date.now()+700}
  })
  root.addEventListener('pointercancel',()=>hold.cancel(),{passive:true})
  root.addEventListener('dragstart',event=>{
    if(Date.now()<touchUntil){event.preventDefault();return}
    hold.cancel()
  },true)
  root.addEventListener('click',event=>{
    if(Date.now()<suppressClickUntil&&!menu.contains(event.target)){event.preventDefault();event.stopImmediatePropagation();suppressClickUntil=0}
  },true)
  menu.addEventListener('pointerdown',event=>event.stopPropagation())
  menu.addEventListener('click',event=>{
    event.stopPropagation()
    const button=event.target.closest('[data-context-index]')
    if(!button||button.disabled)return
    const item=actions[Number(button.dataset.contextIndex)]
    close(true);item?.run()
  })
  root.addEventListener('keydown',event=>{
    if(menu.contains(event.target)){
      const buttons=[...menu.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement)
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
        event.preventDefault();event.stopPropagation()
        const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+buttons.length+(event.key==='ArrowDown'?1:-1))%buttons.length
        buttons[next]?.focus();return
      }
      if(event.key==='Escape'||event.key==='Tab'){
        event.stopPropagation();if(event.key==='Escape')event.preventDefault()
        close(true);return
      }
      if(event.key.length===1&&!event.metaKey&&!event.ctrlKey){
        const next=[...buttons.slice(index+1),...buttons.slice(0,index+1)].find(b=>b.textContent.trim().toLowerCase().startsWith(event.key.toLowerCase()))
        if(next){event.preventDefault();next.focus()}
      }
      return
    }
    if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey){
      if(!enabled(event.target)||event.target.closest('input,textarea,select'))return
      event.preventDefault();event.stopPropagation()
      const rect=event.target.getBoundingClientRect()
      open(event.target,rect.left+12,Math.min(rect.bottom,innerHeight-12),'keyboard')
    }
  })
  document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target))close()},{capture:true,signal})
  document.addEventListener('focusin',event=>{if(!menu.contains(event.target))close()},{signal})
  const dismiss=()=>{hold.cancel();close()}
  document.addEventListener('scroll',event=>{hold.cancel();if(!menu.contains(event.target))close()},{capture:true,passive:true,signal})
  window.addEventListener('resize',dismiss,{signal})
  window.addEventListener('blur',dismiss,{signal})
  document.addEventListener('visibilitychange',dismiss,{signal})
  window.visualViewport?.addEventListener('resize',dismiss,{signal})
  return {close,isOpen:()=>!menu.hidden,destroy(){listeners.abort();dismiss();menu.remove()}}
}
