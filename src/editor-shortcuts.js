// Keep menu hints and the actual insert bindings together. These are scoped to
// the note editor, never search fields, dialogs or the rest of the browser.
export const insertShortcuts = {
  drawing:{key:'p'}, table:{key:'t'}, video:{key:'v'}, divider:{key:'-'},
  section:{key:'s'}, attach:{key:'a'}, 'link-note':{key:'k'}, markdown:{key:'m',shift:true},
}
export const isMacPlatform = () => /Mac|iPhone|iPad/.test(navigator.platform)
export function insertShortcutLabel(command,mac) {
  const binding=insertShortcuts[command]
  if(!binding)return ''
  return (mac?'⌘'+(binding.shift?'⇧':'')+'⌥':'Ctrl+'+(binding.shift?'Shift+':'')+'Alt+')+binding.key.toUpperCase()
}
export function insertShortcut(event,mac) {
  if(event.defaultPrevented||event.repeat||event.isComposing||event.getModifierState?.('AltGraph'))return null
  if(!event.altKey||(mac?!event.metaKey||event.ctrlKey:!event.ctrlKey||event.metaKey))return null
  // Option changes event.key on macOS (for example P becomes π). Prefer the
  // typed Latin key on other layouts, falling back to the physical key then.
  const key=/^[a-z-]$/i.test(event.key)?event.key.toLowerCase():event.code==='Minus'?'-':/^Key[A-Z]$/.test(event.code||'')?event.code.slice(3).toLowerCase():''
  return Object.entries(insertShortcuts).find(([,binding])=>binding.key===key&&!!binding.shift===!!event.shiftKey)?.[0]||null
}

export function drawingShortcut(event,mac) {
  if(event.defaultPrevented||event.isComposing||event.altKey||event.getModifierState?.('AltGraph'))return null
  const modified=event.metaKey||event.ctrlKey
  const key=event.key.toLowerCase()
  if(modified){
    if(mac?!event.metaKey||event.ctrlKey:!event.ctrlKey||event.metaKey)return null
    if(key==='z')return event.shiftKey?'redo':'undo'
    if(!mac&&key==='y'&&!event.shiftKey)return 'redo'
    if(key==='a'&&!event.shiftKey)return 'clear-selection'
    return null
  }
  if(event.shiftKey)return null
  // Number keys pick the toolbar's inks, in order.
  if(/^[1-9]$/.test(key))return 'ink-'+key
  return {p:'pen',h:'highlighter',l:'line',a:'arrow',r:'rectangle',o:'ellipse',d:'diamond',e:'eraser','[':'thinner',']':'thicker',escape:'done'}[key]||null
}
