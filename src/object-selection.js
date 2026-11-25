import { NodeSelection, Selection } from '@tiptap/pm/state'
import { closeHistory } from '@tiptap/pm/history'

export function selectObject(view, getPos, focus=true) {
  const pos=getPos(),node=typeof pos==='number'&&view.state.doc.nodeAt(pos)
  if(!view.editable||!node||!NodeSelection.isSelectable(node))return false
  if(!(view.state.selection instanceof NodeSelection)||view.state.selection.from!==pos)
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc,pos)).setMeta('addToHistory',false))
  if(focus)view.focus()
  return true
}

export function removeObject(view,getPos) {
  const pos=getPos(),node=typeof pos==='number'&&view.state.doc.nodeAt(pos)
  if(!view.editable||!node||!NodeSelection.isSelectable(node))return false
  const tr=closeHistory(view.state.tr).delete(pos,pos+node.nodeSize)
  tr.setSelection(Selection.near(tr.doc.resolve(Math.min(pos,tr.doc.content.size))))
  view.dispatch(tr)
  view.dispatch(closeHistory(view.state.tr))
  view.focus()
  return true
}
