import HorizontalRule from '@tiptap/extension-horizontal-rule'
import { icon } from './icons.js'
import { selectObject, removeObject } from './object-selection.js'

// Keep the stored/clipboard/public representation a plain <hr>. Only the
// editor needs a generous hit area and a small, contextual remove control.
export const NoteDivider=HorizontalRule.extend({
  addNodeView(){
    return ({view,getPos,editor})=>{
      const dom=document.createElement('div'),line=document.createElement('hr')
      dom.className='fn-divider';dom.contentEditable='false'
      dom.append(line)
      if(editor.isEditable){
        dom.tabIndex=0;dom.title='Select divider'
        dom.setAttribute('role','group');dom.setAttribute('aria-label','Divider')
        line.setAttribute('aria-hidden','true')
        const remove=document.createElement('button')
        remove.type='button';remove.className='fn-divider-remove';remove.title='Delete divider'
        remove.setAttribute('aria-label','Delete divider');remove.innerHTML=icon('trash-2')
        dom.append(remove)
        dom.addEventListener('mousedown',event=>event.preventDefault())
        dom.addEventListener('click',event=>{
          event.preventDefault();event.stopPropagation()
          if(remove.contains(event.target))removeObject(view,getPos)
          else selectObject(view,getPos)
        })
        dom.addEventListener('focus',()=>selectObject(view,getPos,false))
      }
      return {dom,stopEvent:event=>!!event.target.closest('button'),ignoreMutation:()=>true}
    }
  },
})
