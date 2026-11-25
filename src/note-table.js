import { mergeAttributes } from '@tiptap/core'
import { Table, TableView } from '@tiptap/extension-table'
import { CellSelection, TableMap, findTable, moveTableRow, moveTableColumn, selectedRect } from '@tiptap/pm/tables'
import { closeHistory } from '@tiptap/pm/history'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { selectObject } from './object-selection.js'
import { icon } from './icons.js'
import { placementAttributes, applyPlacement, unplaced, sideWidth, place, createMover } from './placement.js'
import { createObjectResizer, resizeHandles, resizeLength } from './object-resize.js'
import { createTextAppearance } from './text-appearance.js'

// Table editing is built around direct actions on the table itself:
//  - a "+" strip on the bottom and right edges adds a row or column in one click;
//  - a grip appears for whichever row and column the pointer (or cursor) is in;
//    click it for that row or column's actions, or drag it to reorder;
//  - the corner control is the table's move handle: drag it and the table
//    follows the pointer and stays where it is dropped, with text beside it
//    wherever there is room; click it to select the whole table and see its
//    actions;
//  - column borders can be dragged to resize one column, and the grip at the
//    bottom-right corner resizes the whole table.
const axes = {
  row: { dimension:'height', coordinate:'top', select:CellSelection.rowSelection, move:moveTableRow,
    before:'addRowBefore', after:'addRowAfter', remove:'deleteRow', back:'up', forward:'down',
    insert:['Insert above','Insert below'], insertIcons:['between-horizontal-start','between-horizontal-end'],
    moveIcons:['arrow-up','arrow-down'], header:['header-row','Header row','panel-top'] },
  column: { dimension:'width', coordinate:'left', select:CellSelection.colSelection, move:moveTableColumn,
    before:'addColumnBefore', after:'addColumnAfter', remove:'deleteColumn', back:'left', forward:'right',
    insert:['Insert left','Insert right'], insertIcons:['between-vertical-start','between-vertical-end'],
    moveIcons:['arrow-left','arrow-right'], header:['header-column','Header column','panel-left'] },
}
const item = (action,label,glyph) => `<button type="button" data-table-action="${action}">${icon(glyph)}<span>${label}</span></button>`

// The first gesture arranges a table; a click enters a cell. Once editing,
// normal text/cell selection wins until Escape selects the whole table again.
// Column edges and modified selections always belong to the table editor.
export function canDragTableSurface(view,pos,table,target,event) {
  if(event.shiftKey||event.metaKey||event.ctrlKey)return false
  if(target.closest?.('button,a,input,select,textarea,.fn-attachment,.fn-code-block'))return false
  const cell=target.closest?.('td,th')
  if(cell){
    if(cell.closest('table')!==table)return false
    const bounds=cell.getBoundingClientRect()
    if(event.clientX-bounds.left<6||bounds.right-event.clientX<6)return false
  }
  const {selection}=view.state
  return !((view.hasFocus()||table.contains(document.activeElement))&&
    !(selection instanceof NodeSelection)&&findTable(selection.$from)?.pos===pos)
}

class EditableTableView extends TableView {
  constructor({node,cellMinWidth,view,attrs,editor,getPos,onOpen,root}){
    super(node,cellMinWidth,view,attrs)
    const scroll=this.dom
    this.dom=document.createElement('div')
    this.dom.className='fn-table'
    this.dom.title='Drag to move. Click a cell to edit. Escape selects the table.'
    this.dom.append(scroll)
    const menu=document.createElement('div')
    menu.className='fn-popover fn-table-menu'
    menu.contentEditable='false'
    menu.setAttribute('role','group')
    menu.hidden=true
    // Menus belong to the UI layer, outside movable objects and their z-index:
    // the app's root element (see createNotebook), or next to the editor.
    ;(root||view.dom.parentElement).append(menu)
    this.menu=menu
    const control=(className,label,glyph)=>{
      const element=document.createElement('button')
      element.type='button'
      element.className=className
      element.setAttribute('aria-label',label)
      element.setAttribute('title',label)
      element.setAttribute('contenteditable','false')
      element.innerHTML=icon(glyph)
      element.hidden=true
      this.dom.append(element)
      return element
    }
    const handles={
      row:control('fn-table-handle fn-row-handle','Row options. Drag to move.','grip-vertical'),
      column:control('fn-table-handle fn-column-handle','Column options. Drag to move.','grip-horizontal'),
    }
    for(const handle of Object.values(handles)){handle.draggable=true;handle.setAttribute('aria-expanded','false')}
    const corner=control('fn-table-handle fn-table-corner','Drag to move the table. Click for table options.','move')
    corner.setAttribute('aria-expanded','false')
    const adders={row:control('fn-table-add fn-add-row','Add row','plus'),column:control('fn-table-add fn-add-column','Add column','plus')}
    const grips=resizeHandles(this.dom,'table',icon)
    grips[0].className='fn-table-resize'
    for(const grip of grips)grip.hidden=true
    const band=document.createElement('div')
    band.className='fn-table-drop'
    band.hidden=true
    this.dom.append(band)
    this.handles=handles
    this.controls=[...Object.values(handles),corner,...Object.values(adders),...grips]
    let anchor,activeAxis,activeIndex,activeCross,drag,hover,rest,restTimer,frame=0,releaseMenu
    const tableInfo=()=>{
      const pos=getPos(),table=typeof pos==='number'&&editor.state.doc.nodeAt(pos)
      if(table?.type.spec.tableRole==='table')return {pos,table,map:TableMap.get(table)}
    }
    const selectionInfo=()=>{
      const info=tableInfo()
      if(!info)return
      const {$from,$to}=editor.state.selection
      if(findTable($from)?.pos!==info.pos||findTable($to)?.pos!==info.pos)return
      return {...info,rect:selectedRect(editor.state)}
    }
    const hitCell=event=>{
      const cell=event.target.closest?.('td,th')
      return cell?.closest('table')===this.table?cell:null
    }
    // Row and column of a rendered cell, read from the document rather than the DOM.
    const cellIndex=cell=>{
      const info=tableInfo()
      if(!info)return
      const offset=view.posAtDOM(cell,0)-info.pos-2
      if(!info.map.map.includes(offset))return
      const rect=info.map.findCell(offset)
      return {row:rect.top,column:rect.left}
    }
    const cellAt=(info,axis,index)=>{
      const offset=info.map.map[axis==='row'?index*info.map.width:index]
      return offset===undefined?null:view.nodeDOM(info.pos+1+offset)
    }
    const setMenuClosed=(restore=false)=>{
      releaseMenu?.();releaseMenu=undefined
      menu.hidden=true
      anchor?.setAttribute('aria-expanded','false')
      const old=anchor
      anchor=activeAxis=activeIndex=activeCross=undefined
      // Back to the note, selection intact, so the keyboard acts on what was selected.
      if(restore&&old)view.focus()
      schedule()
    }
    const placeMenu=()=>{
      if(!anchor||menu.hidden)return
      const ref=anchor.getBoundingClientRect()
      const below=innerHeight-ref.bottom,above=ref.top
      const opensUp=above>below&&below<menu.offsetHeight+12
      const y=Math.max(8,Math.min(innerHeight-menu.offsetHeight-8,opensUp?ref.top-menu.offsetHeight-5:ref.bottom+5))
      const x=Math.max(8,Math.min(ref.left,innerWidth-menu.offsetWidth-8))
      menu.style.left=x+'px'
      menu.style.top=y+'px'
    }
    const showMenu=(trigger,axis,index,cross=0)=>{
      if(anchor===trigger&&!menu.hidden){setMenuClosed(true);return}
      setMenuClosed()
      anchor=trigger;activeAxis=axis;activeIndex=index;activeCross=cross
      if(axis==='table'){
        menu.setAttribute('aria-label','Table actions')
        menu.innerHTML=item('place-left','Place left, text beside','arrow-left-to-line')
          +item('place-right','Place right, text beside','arrow-right-to-line')
          +(this.dom.dataset.layout?item('place-line','Place on its own line','stretch-horizontal'):'')
          +'<hr>'+item('header-row','Header row','panel-top')+item('header-column','Header column','panel-left')
          +item('background','Table background','paint-bucket')
          +(this.table.style.width?'<hr>'+item('fit-page','Fit to page width','move-horizontal'):'')
          +'<hr>'+item('to-text','Convert to text','type')+item('delete-table','Delete table','trash-2')
      }else{
        const config=axes[axis],other=axis==='row'?'column':'row',length=tableInfo().map[config.dimension]
        const insert=(target,side)=>item(`insert-${target}-${side?'after':'before'}`,axes[target].insert[side],axes[target].insertIcons[side])
        menu.setAttribute('aria-label',axis==='row'?'Row actions':'Column actions')
        // This grip's own direction first, then the other, so nothing needs a second trip.
        menu.innerHTML=item('background',axis==='row'?'Row background':'Column background','paint-bucket')+'<hr>'+insert(axis,0)+insert(axis,1)+insert(other,0)+insert(other,1)
          +(index>0||index<length-1?'<hr>':'')
          +(index>0?item('move-back','Move '+config.back,config.moveIcons[0]):'')
          +(index<length-1?item('move-forward','Move '+config.forward,config.moveIcons[1]):'')
          +(index===0?'<hr>'+item(...config.header):'')
          +(length>1?'<hr>'+item('axis-delete','Delete '+axis,'trash-2'):'')
      }
      trigger.setAttribute('aria-expanded','true')
      menu.hidden=false
      releaseMenu=onOpen?.(()=>setMenuClosed(true))
      placeMenu()
      menu.querySelector('button').focus({preventScroll:true})
    }
    const refresh=()=>{
      frame=0
      const info=editor.isEditable&&tableInfo()
      const selection=info&&selectionInfo()
      const inTable=selection&&(editor.isFocused||this.dom.contains(document.activeElement)||anchor)
      const whole=info&&editor.state.selection instanceof NodeSelection&&editor.state.selection.from===info.pos
      const active=!!info&&!!(inTable||whole||hover||anchor)
      this.dom.classList.toggle('is-active',active)
      this.dom.classList.toggle('is-cell-editing',!!inTable)
      corner.hidden=adders.row.hidden=adders.column.hidden=!active&&!this.dom.classList.contains('is-resizing')
      for(const grip of grips)grip.hidden=corner.hidden
      const bounds=this.dom.getBoundingClientRect(),viewport=scroll.getBoundingClientRect()
      for(const [axis,handle] of Object.entries(handles)){
        // The open menu's row or column wins, then the pointer, then the cursor.
        const index=!active?-1:activeAxis===axis?activeIndex:hover?hover[axis]:inTable?selection.rect[axes[axis].coordinate]:-1
        const cell=index>=0?cellAt(info,axis,index):null
        handle.hidden=!cell
        if(handle.hidden)continue
        const r=cell.getBoundingClientRect()
        if(axis==='row'){
          handle.style.top=(r.top-bounds.top-this.dom.clientTop+r.height/2)+'px'
        }else{
          const left=Math.max(r.left,viewport.left),right=Math.min(r.right,viewport.right)
          handle.hidden=left>=right
          if(!handle.hidden)handle.style.left=(left+(right-left)/2-bounds.left-this.dom.clientLeft)+'px'
        }
        handle.dataset.index=index
      }
      if(anchor?.hidden)setMenuClosed()
      else placeMenu()
    }
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(refresh)}
    // While dragging a grip, a band shows the row or column it would land on.
    const markDrop=cell=>{
      if(!cell||!drag){band.hidden=true;return}
      const bounds=this.dom.getBoundingClientRect(),table=this.table.getBoundingClientRect(),viewport=scroll.getBoundingClientRect()
      const r=(drag.axis==='row'?cell.parentElement:cell).getBoundingClientRect()
      const left=drag.axis==='row'?Math.max(table.left,viewport.left):Math.max(r.left,viewport.left)
      const right=drag.axis==='row'?Math.min(table.right,viewport.right):Math.min(r.right,viewport.right)
      band.style.left=(left-bounds.left)+'px'
      band.style.width=Math.max(0,right-left)+'px'
      band.style.top=((drag.axis==='row'?r.top:table.top)-bounds.top)+'px'
      band.style.height=(drag.axis==='row'?r.height:table.height)+'px'
      band.hidden=false
    }
    const focusAfter=()=>editor.commands.focus()
    const selectAxis=(axis,index)=>{
      const info=tableInfo()
      if(!info)return false
      const offset=info.map.map[axis==='row'?index*info.map.width:index]
      if(offset===undefined)return false
      const cell=editor.state.doc.resolve(info.pos+1+offset)
      view.dispatch(editor.state.tr.setSelection(axes[axis].select(cell)))
      return true
    }
    const cursorInto=(row,column)=>{
      const info=tableInfo()
      const offset=info?.map.map[row*info.map.width+column]
      if(offset===undefined)return false
      return editor.chain().focus().setTextSelection(info.pos+1+offset+2).scrollIntoView().run()
    }
    function moveAxis(axis,from,to){
      const info=tableInfo()
      if(!info||from===to||to<0||to>=info.map[axes[axis].dimension])return
      if(axes[axis].move({from,to,pos:info.pos+3})(editor.state,tr=>view.dispatch(tr.scrollIntoView())))focusAfter()
    }
    // A new column takes the width of the column it was added beside. In a table
    // with no set widths every column is equal already, so nothing needs storing.
    const addColumn=(after,index)=>{
      const reference=columnWidths()[index]
      const sized=[...this.colgroup.children].some(column=>column.style.width)
      if(!selectAxis('column',index))return false
      return editor.chain()[after?'addColumnAfter':'addColumnBefore']().command(({tr})=>{
        if(!sized||!reference)return true
        const pos=getPos(),table=typeof pos==='number'&&tr.doc.nodeAt(pos)
        if(!table||table.type.spec.tableRole!=='table')return true
        const map=TableMap.get(table),column=after?index+1:index,seen=new Set()
        for(let row=0;row<map.height;row++){
          const offset=map.map[row*map.width+column]
          if(seen.has(offset))continue
          seen.add(offset)
          const cell=table.nodeAt(offset)
          if((cell.attrs.colspan||1)===1)tr.setNodeMarkup(pos+1+offset,null,{...cell.attrs,colwidth:[Math.round(reference)]})
        }
        return true
      }).scrollIntoView().run()
    }
    // One click on an edge strip: add at the end and put the cursor in the new cell.
    const appendAxis=axis=>{
      const info=tableInfo()
      if(!info||!editor.isEditable)return
      const last=info.map[axes[axis].dimension]-1
      if(axis==='column'?!addColumn(true,last):(!selectAxis(axis,last)||!editor.chain()[axes[axis].after]().run()))return
      cursorInto(axis==='row'?last+1:0,axis==='row'?0:last+1)
    }

    for(const [axis,handle] of Object.entries(handles)){
      handle.addEventListener('click',()=>{
        const index=Number(handle.dataset.index)
        if(anchor===handle&&!menu.hidden){setMenuClosed(true);return}
        const other=axis==='row'?'column':'row',selection=selectionInfo()
        const cross=rest?rest[other]:selection?selection.rect[axes[other].coordinate]:Number(handles[other].dataset.index)||0
        if(selectAxis(axis,index))showMenu(handle,axis,index,cross)
      })
      handle.addEventListener('dragstart',event=>{
        setMenuClosed()
        drag={axis,from:Number(handle.dataset.index)}
        this.dom.classList.add('is-dragging')
        event.dataTransfer?.setData('application/x-family-wallet-table',axis)
        if(event.dataTransfer)event.dataTransfer.effectAllowed='move'
      })
      handle.addEventListener('dragend',()=>{drag=undefined;this.dom.classList.remove('is-dragging');markDrop(null)})
    }
    corner.addEventListener('click',()=>{
      if(mover.wasDragged())return
      if(anchor===corner&&!menu.hidden){setMenuClosed(true);return}
      const info=tableInfo()
      if(!info)return
      const first=info.pos+1+info.map.map[0],last=info.pos+1+info.map.map[info.map.map.length-1]
      view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc,first,last)))
      showMenu(corner,'table',0)
    })
    for(const [axis,adder] of Object.entries(adders))adder.addEventListener('click',()=>{setMenuClosed();appendAxis(axis)})
    // Store one width per column on every cell; null returns the table to page width.
    const setTableSize=({widths,height},transaction)=>{
      const info=tableInfo()
      if(!info)return
      const tr=transaction||closeHistory(editor.state.tr),seen=new Set()
      if(widths!==undefined)for(let row=0;row<info.map.height;row++)for(let column=0;column<info.map.width;column++){
        const offset=info.map.map[row*info.map.width+column]
        if(seen.has(offset))continue
        seen.add(offset)
        const cell=info.table.nodeAt(offset),span=cell.attrs.colspan||1
        tr.setNodeMarkup(info.pos+1+offset,null,{...cell.attrs,colwidth:widths?widths.slice(column,column+span):null})
      }
      const current=tr.doc.nodeAt(info.pos)
      const attrs={...current.attrs}
      if(height!==undefined)attrs.minHeight=height
      if(current.attrs.layout==='canvas' && widths!==undefined){
        attrs.canvasWidth=widths?widths.reduce((sum,width)=>sum+width,0)+2:view.dom.clientWidth
        if(!widths)attrs.offset=0
      }
      if(height!==undefined || attrs.canvasWidth!==current.attrs.canvasWidth || attrs.offset!==current.attrs.offset)tr.setNodeMarkup(info.pos,null,attrs)
      if(!transaction){view.dispatch(tr);view.dispatch(closeHistory(view.state.tr))}
    }
    const columnWidths=()=>{
      const info=tableInfo()
      return info?Array.from({length:info.map.width},(_,column)=>{
        const cell=cellAt(info,'column',column),span=cell?.colSpan||1
        return cell?cell.getBoundingClientRect().width/span:cellMinWidth
      }):[]
    }
    // The same table with a new placement. A table that still spans the page is
    // brought down to under half of it the first time it is placed, so there is
    // room to move it and to put another beside it; a sized table keeps its size.
    const rebuild=(table,placement,page)=>{
      const map=TableMap.get(table),current=columnWidths(),total=current.reduce((sum,width)=>sum+width,0)
      let widths=null
      if(placement.layout&&total&&!this.table.style.width){
        const target=sideWidth(page)
        widths=current.map(width=>Math.max(cellMinWidth,Math.floor(width*target/total)))
      }
      const rows=[]
      table.forEach((row,rowOffset)=>{
        const cells=[]
        row.forEach((cell,cellOffset)=>{
          if(!widths){cells.push(cell);return}
          const {left}=map.findCell(rowOffset+1+cellOffset),span=cell.attrs.colspan||1
          cells.push(cell.type.create({...cell.attrs,colwidth:widths.slice(left,left+span)},cell.content,cell.marks))
        })
        rows.push(row.type.create(row.attrs,cells,row.marks))
      })
      return table.type.create({...table.attrs,...placement},rows,table.marks)
    }
    const widthFor=page=>this.table.style.width?this.table.getBoundingClientRect().width:sideWidth(page)
    const mover=createMover({view,dom:this.dom,handle:this.dom,getPos,rebuild,widthFor,isEditable:()=>editor.isEditable,
      preventDefault:true,root,
      ignore:(target,event)=>{
        if(corner.contains(target))return false
        if(this.controls.some(control=>control.contains(target)))return true
        return !canDragTableSurface(view,getPos(),this.table,target,event)
      },
      onStart:()=>setMenuClosed(),
      onClick:(event,target)=>{
        if(corner.contains(target))return
        const at=view.posAtCoords({left:event.clientX,top:event.clientY})
        if(!at)return
        const $pos=view.state.doc.resolve(at.pos)
        if(findTable($pos)?.pos!==getPos()||!$pos.parent.isTextblock)return
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,at.pos)).setMeta('addToHistory',false))
        view.focus()
      },
    })
    const resizeGesture=createObjectResizer({view,dom:this.dom,handles:grips,getPos,isEditable:()=>editor.isEditable,
      begin:()=>{
        setMenuClosed()
        const start=columnWidths(),total=start.reduce((sum,width)=>sum+width,0)
        const rect=this.dom.getBoundingClientRect(),page=view.dom.getBoundingClientRect()
        const right=getComputedStyle(this.dom).float==='right'
        return total?{start,total,right,height:this.table.getBoundingClientRect().height,maximum:Math.max(start.length*cellMinWidth,(right?rect.right-page.left:page.right-rect.left)-2)}:null
      },
      preview:(data,dx,dy,axis)=>{
        if(axis!=='width'){
          const height=resizeLength(data.height+dy,1)
          data.nextHeight=dy?height:undefined
          this.dom.style.setProperty('--fn-min-height',height+'px')
        }
        if(axis==='height')return
        data.changedWidth=!!dx
        const least=data.start.length*cellMinWidth
        const target=Math.max(least,Math.min(data.maximum,data.total+(data.right?-dx:dx)))
        data.widths=data.start.map(width=>Math.max(cellMinWidth,Math.round(width*target/data.total)))
        data.widths.forEach((width,index)=>{const column=this.colgroup.children[index];if(column){column.style.width=width+'px';column.style.minWidth=''}})
        this.table.style.width=data.widths.reduce((sum,width)=>sum+width,0)+'px'
        if(this.dom.classList.contains('fn-canvas-object'))this.dom.style.width=(data.widths.reduce((sum,width)=>sum+width,0)+2)+'px'
        this.table.style.minWidth=''
        this.dom.classList.add('is-sized')
        schedule()
      },
      commit:(data,tr)=>{setTableSize({widths:data.changedWidth?data.widths:undefined,height:data.nextHeight},tr);schedule()},
    })
    for(const grip of grips)grip.addEventListener('dblclick',()=>{
      if(!editor.isEditable)return
      const axis=grip.dataset.resizeAxis
      setTableSize({widths:axis==='height'?undefined:null,height:axis==='width'?undefined:0})
      focusAfter()
    })
    // Controls must not take focus (and the selection) away from the note.
    for(const element of this.controls)element.addEventListener('mousedown',event=>{if(element.draggable!==true)event.preventDefault()})

    scroll.addEventListener('pointermove',event=>{
      if(event.pointerType==='touch'||drag||!editor.isEditable)return
      const cell=hitCell(event),next=cell&&cellIndex(cell)
      if(next&&(!hover||hover.row!==next.row||hover.column!==next.column)){
        hover=next;schedule()
        // The cell the pointer settles on is the one meant; cells merely crossed on
        // the way to a grip are not.
        clearTimeout(restTimer)
        restTimer=setTimeout(()=>{rest=next},140)
      }
    })
    this.dom.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch'&&!hover){hover=selectionInfo()?{row:selectionInfo().rect.top,column:selectionInfo().rect.left}:{row:0,column:0};schedule()}})
    this.dom.addEventListener('pointerleave',()=>{clearTimeout(restTimer);rest=undefined;if(hover){hover=undefined;schedule()}})
    scroll.addEventListener('dragover',event=>{
      if(!drag)return
      const cell=hitCell(event)
      if(!cell)return
      event.preventDefault();event.stopPropagation()
      event.dataTransfer.dropEffect='move'
      markDrop(cell)
    },true)
    scroll.addEventListener('dragleave',event=>{if(drag&&!scroll.contains(event.relatedTarget))markDrop(null)})
    scroll.addEventListener('drop',event=>{
      if(!drag)return
      event.preventDefault();event.stopPropagation()
      const cell=hitCell(event),{axis,from}=drag,target=cell&&cellIndex(cell)
      drag=undefined;this.dom.classList.remove('is-dragging');markDrop(null)
      if(target)moveAxis(axis,from,target[axis])
    },true)

    const appearance=createTextAppearance({menu,getEditor:()=>editor,finish:()=>setMenuClosed()})
    menu.addEventListener('mousedown',event=>{if(event.target.closest('button'))event.preventDefault()})
    menu.addEventListener('click',event=>{
      const action=event.target.closest('[data-table-action]')?.dataset.tableAction
      const axis=activeAxis,index=activeIndex,activeCrossAt=activeCross||0
      if(!action||!axis||!editor.isEditable)return
      if(action==='background'){
        menu.innerHTML=appearance.show(axis+'-background')
        placeMenu()
        menu.querySelector('button')?.focus({preventScroll:true})
        return
      }
      setMenuClosed()
      const whole={'header-row':'toggleHeaderRow','header-column':'toggleHeaderColumn','to-text':'convertTableToText','delete-table':'deleteTable'}[action]
      if(whole){editor.chain().focus()[whole]().run();return}
      if(action==='fit-page'){setTableSize({widths:null});focusAfter();return}
      if(action.startsWith('place-')){place({view,getPos,placement:action==='place-line'?unplaced:{...unplaced,layout:action.slice(6)},rebuild});return}
      const insert=/^insert-(row|column)-(before|after)$/.exec(action)
      if(insert){
        const [,target,side]=insert
        const at=target===axis?index:activeCrossAt
        if(target==='column'?addColumn(side==='after',at):(selectAxis(target,at)&&editor.chain()[axes[target][side]]().scrollIntoView().run()))focusAfter()
        return
      }
      if(action==='move-back'||action==='move-forward'){
        moveAxis(axis,index,index+(action==='move-back'?-1:1))
        return
      }
      if(!selectAxis(axis,index))return
      const commands=editor.chain(),name=axes[axis][action==='axis-delete'?'remove':action.slice(5)]
      if(name&&commands[name]().scrollIntoView().run())focusAfter()
    })

    const closeOutside=e=>{if(anchor&&!menu.contains(e.target)&&!this.controls.some(c=>c.contains(e.target)))setMenuClosed()}
    document.addEventListener('pointerdown',closeOutside,true)
    this.dom.addEventListener('focusout',e=>{if(anchor&&!this.dom.contains(e.relatedTarget)&&!menu.contains(e.relatedTarget))setMenuClosed();schedule()})
    this.dom.addEventListener('focusin',schedule)
    const menuKey=e=>{
      if(e.defaultPrevented)return
      if(menu.hidden){
        if(e.key==='Escape'&&selectionInfo()){
          e.preventDefault();e.stopPropagation();selectObject(view,getPos())
        }
        return
      }
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setMenuClosed(true)}
      if(e.target.closest('.fn-table-menu')&&!e.target.matches('input')&&['ArrowUp','ArrowDown'].includes(e.key)){
        e.preventDefault();e.stopPropagation()
        const buttons=[...menu.querySelectorAll('button')],index=buttons.indexOf(e.target)
        buttons[(index+buttons.length+(e.key==='ArrowDown'?1:-1))%buttons.length].focus()
      }
    }
    this.dom.addEventListener('keydown',menuKey)
    menu.addEventListener('keydown',menuKey)
    menu.addEventListener('focusout',e=>{if(anchor&&e.relatedTarget&&!menu.contains(e.relatedTarget)&&!this.dom.contains(e.relatedTarget))setMenuClosed()})
    const resize=new ResizeObserver(schedule)
    resize.observe(this.dom)
    resize.observe(this.table)
    scroll.addEventListener('scroll',schedule,{passive:true})
    window.addEventListener('scroll',schedule,{capture:true,passive:true})
    editor.on('transaction',schedule)
    editor.on('focus',schedule)
    editor.on('blur',schedule)
    this.cleanup=()=>{
      releaseMenu?.()
      menu.remove()
      cancelAnimationFrame(frame);clearTimeout(restTimer);resize.disconnect();mover.destroy();resizeGesture.destroy()
      document.removeEventListener('pointerdown',closeOutside,true)
      window.removeEventListener('scroll',schedule,true)
      editor.off('transaction',schedule);editor.off('focus',schedule);editor.off('blur',schedule)
    }
    this.dom.classList.toggle('is-sized',!!this.table.style.width)
    applyPlacement(this.dom,node.attrs)
    schedule()
  }
  // The base view sets a column's width but never clears it, so undoing a resize
  // left the old width on screen. Columns without a stored width go back to auto.
  update(node){
    if(!super.update(node))return false
    let index=0
    node.firstChild?.forEach(cell=>{
      const {colspan=1,colwidth}=cell.attrs
      for(let part=0;part<colspan;part++,index++){
        if(!(colwidth&&colwidth[part]))this.colgroup.children[index]?.style.removeProperty('width')
      }
    })
    this.dom.classList.toggle('is-sized',!!this.table.style.width)
    applyPlacement(this.dom,node.attrs)
    return true
  }
  stopEvent(e){return this.menu.contains(e.target)||this.controls.some(c=>c.contains(e.target))}
  // Changes to the controls around the table are not edits to the note.
  ignoreMutation(mutation){
    if(mutation.type!=='selection'&&!this.table.contains(mutation.target))return true
    return super.ignoreMutation(mutation)
  }
  destroy(){this.cleanup()}
}

// With a whole row or column selected and nothing in it, Delete removes it. With
// content, the first press clears the cells as usual.
function removeEmptySelection(editor){
  const {selection}=editor.state
  if(!(selection instanceof CellSelection))return false
  let empty=true
  selection.forEachCell(cell=>{if(cell.textContent||cell.childCount>1||cell.firstChild?.type.name!=='paragraph')empty=false})
  if(!empty)return false
  const rows=selection.isRowSelection(),columns=selection.isColSelection()
  if(rows&&columns)return editor.commands.deleteTable()
  if(rows)return editor.commands.deleteRow()
  if(columns)return editor.commands.deleteColumn()
  return false
}

export const NoteTable=Table.extend({
  addOptions(){return {...this.parent?.(),allowTableNodeSelection:true,root:null}},
  addAttributes(){return {...this.parent?.(),...placementAttributes}},
  addCommands(){
    return {
      ...this.parent?.(),
      convertTableToText:()=>({tr,dispatch})=>{
        const {$from,$to}=tr.selection
        const match=findTable($from)
        if(!match||findTable($to)?.pos!==match.pos)return false
        if(!dispatch)return true
        const {node:table,pos}=match,schema=tr.doc.type.schema,paragraphs=[]
        table.forEach(row=>{
          const cells=[]
          row.forEach(cell=>cells.push(cell.textBetween(0,cell.content.size,' ')))
          const text=cells.join('\t')
          paragraphs.push(schema.nodes.paragraph.create(null,text?schema.text(text):null))
        })
        tr.replaceWith(pos,pos+table.nodeSize,paragraphs).scrollIntoView()
        return true
      },
    }
  },
  addKeyboardShortcuts(){
    const parent=this.parent?.()||{}
    const remove=key=>props=>removeEmptySelection(this.editor)||(parent[key]?parent[key](props):false)
    return {...parent, Backspace:remove('Backspace'), Delete:remove('Delete'), Escape:()=>{
      const table=findTable(this.editor.state.selection.$from)
      return !!table&&selectObject(this.editor.view,()=>table.pos)
    }, Enter:()=>{
      const {state}=this.editor,{$from,empty}=state.selection
      if(!empty||!findTable($from)||$from.parentOffset!==$from.parent.content.size)return false
      const {bottom,right,map}=selectedRect(state)
      if(bottom!==map.height||right!==map.width)return false
      return this.editor.chain().addRowAfter().goToNextCell().run()
    }}
  },
  addNodeView(){
    return ({node,view,HTMLAttributes,editor,getPos})=>new EditableTableView({
      node,view,editor,getPos,cellMinWidth:this.options.cellMinWidth,
      attrs:mergeAttributes(this.options.HTMLAttributes,HTMLAttributes),
      onOpen:this.options.onOpen,root:this.options.root,
    })
  },
}).configure({cellMinWidth:28,renderWrapper:true,resizable:true})
