import { TextSelection } from '@tiptap/pm/state'

// Browser selections can start outside the editable body and include the title
// and metadata. Clear those too, while leaving unrelated fields alone.
export function selectionTouches(selection,paper) {
  if(!selection?.rangeCount||selection.isCollapsed)return false
  if(paper.contains(selection.anchorNode)||paper.contains(selection.focusNode))return true
  for(let index=0;index<selection.rangeCount;index++){
    try{if(selection.getRangeAt(index).intersectsNode(paper))return true}catch{}
  }
  return false
}

export function drawingSelectionGuard(view,paper,doc=document,onPaperPress=()=>{}) {
  const clear=()=>{
    if(view.isDestroyed)return false
    let changed=false
    // Removing DOM ranges alone leaves an editor Select All active, ready to
    // replace text on the next edit. Collapse the model without touching history.
    if(!view.state.selection.empty){
      const at=view.state.doc.resolve(view.state.selection.from)
      // near() can select the same atom again. Find a text caret so entering
      // drawing mode from an object selection cannot consume every stroke.
      const caret=TextSelection.findFrom(at,1,true)||TextSelection.findFrom(at,-1,true)
      if(caret){
        view.dispatch(view.state.tr.setSelection(caret).setMeta('addToHistory',false));changed=true
      }
    }
    const selection=doc.getSelection()
    if(selectionTouches(selection,paper)){selection.removeAllRanges();changed=true}
    return changed
  }
  const prevent=event=>{event.preventDefault();clear()}
  const press=event=>{event.preventDefault();event.stopPropagation();clear();onPaperPress()}
  const capture={capture:true}
  const selected=()=>{if(selectionTouches(doc.getSelection(),paper))clear()}
  clear()
  paper.classList.add('fn-drawing-active')
  paper.addEventListener('selectstart',prevent)
  paper.addEventListener('dragstart',prevent)
  // The canvas handles drawing clicks. The remaining paper (title, metadata,
  // margins) dismisses selection without moving the text caret or creating ink.
  paper.addEventListener('pointerdown',press,capture)
  paper.addEventListener('click',press,capture)
  doc.addEventListener('selectionchange',selected)
  return {clear,destroy(){
    paper.classList.remove('fn-drawing-active')
    paper.removeEventListener('selectstart',prevent)
    paper.removeEventListener('dragstart',prevent)
    paper.removeEventListener('pointerdown',press,capture)
    paper.removeEventListener('click',press,capture)
    doc.removeEventListener('selectionchange',selected)
  }}
}
