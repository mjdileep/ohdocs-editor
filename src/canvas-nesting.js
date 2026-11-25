// Canvas coordinates belong to the page, even when ProseMirror fits a paste
// inside a list, quote, or cell. Keep the surrounding structured text intact.
export function promoteCanvasObject(tr,pos){
  const resolved=tr.doc.resolve(pos)
  if(!resolved.depth)return pos
  const node=tr.doc.nodeAt(pos),after=resolved.after(1),mappingStart=tr.mapping.maps.length
  tr.delete(pos,pos+node.nodeSize)
  const destination=tr.mapping.slice(mappingStart).map(after,-1)
  tr.insert(destination,node)
  return destination
}

export function promotePastedCanvas(tr){
  const positions=[]
  tr.doc.descendants((node,pos)=>{
    if(!['previewAttachment','table','codeBlock'].includes(node.type.name))return
    if(node.attrs.layout==='canvas'&&!node.attrs.documentFlow&&tr.doc.resolve(pos).depth)positions.push(pos)
    // A table is one pasted object; its own cell contents stay with it.
    return false
  })
  for(const pos of positions.reverse())promoteCanvasObject(tr,pos)
  return tr
}
