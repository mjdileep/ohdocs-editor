import { drawingData, drawingSVG } from '../format/drawing.mjs'
import { drawingDownloadButton } from './drawing-download.js'
import { startDrawing } from './drawing.js'
import { DOMSerializer, Fragment, Slice } from '@tiptap/pm/model'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { closeHistory } from '@tiptap/pm/history'
import { TableMap } from '@tiptap/pm/tables'
import { Editor, Extension, Node, getMarkRange, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { NoteCodeBlock } from './code-block.js'
import { TableKit } from '@tiptap/extension-table'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import { TextStyle, TextHighlight } from './text-formatting.js'
import { TableAppearance } from './table-appearance.js'
import { insertDivider } from './editor-insertions.js'
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details'
import { Placeholder } from '@tiptap/extensions'
import Suggestion, { exitSuggestion } from '@tiptap/suggestion'
import { NoteTable } from './note-table.js'
import { placementAttributes, applyPlacement, unplaced, sideWidth, place, createMover, tidyChannels } from './placement.js'
import { createObjectResizer, resizeHandles, resizeLength, visualSize, fittedWidth } from './object-resize.js'
import { mediaAngle, mediaAxes } from '../format/media-geometry.mjs'
import { setPictureRatio, paintRotation, startMediaTransform, mediaPlacement, previewMedia } from './media-transform.js'
import { CanvasFlow, canvasPastePlacement } from './canvas-flow.js'
import { NoteMarkdown, MarkdownPaste, NoteInlineMath, NoteBlockMath, FootnoteReference, FootnoteDefinition, Superscript, Subscript, SafeBlockHTML, SafeInlineHTML, LiteralHTML, markdownImage } from './markdown.js'
import { videoSource } from '../format/video.mjs'
import { mountVideo } from './video-player.js'
import { imageFormat, formattedImage } from '../format/image-format.mjs'
import { ObjectDeletion } from './object-deletion.js'
import { selectObject, removeObject } from './object-selection.js'
import { floatObjectTools, objectToolbar } from './object-tools.js'
import { NoteDivider } from './divider.js'
import { markdownURL } from '../format/markdown.mjs'
import { isNewerFormat, displayableDocument, migrateDocument } from '../format/schema.mjs'
import { DocumentFormat } from './document-format.js'
import { ObjectKeys } from './object-keys.js'

// The shape of each picture seen on this device, so its place can be kept while
// it loads next time. Only sizes are remembered, never the pictures themselves.
const pictureSizes = (() => {
  const key = 'safefn.picture-sizes'
  let sizes = {}
  try { sizes = JSON.parse(localStorage.getItem(key)) || {} } catch {}
  return {
    get: id => Array.isArray(sizes[id]) && sizes[id][0] > 0 && sizes[id][1] > 0 ? sizes[id] : null,
    set(id, width, height) {
      if (!id || !width || !height || sizes[id]?.[0] === width && sizes[id]?.[1] === height) return
      delete sizes[id]
      sizes[id] = [width, height]
      const ids = Object.keys(sizes)
      for (const old of ids.slice(0, Math.max(0, ids.length - 400))) delete sizes[old]
      try { localStorage.setItem(key, JSON.stringify(sizes)) } catch {}
    },
  }
})()

const Attachment = Node.create({
  name: 'previewAttachment',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      // Carried through copy and paste so a pasted copy still shows its picture.
      drawingPageWidth: { default: 0, parseHTML: el => Math.max(0,Math.min(10000,Number(el.getAttribute('data-ink-page'))||0)), renderHTML: a => a.drawingPageWidth ? { 'data-ink-page': a.drawingPageWidth } : {} },
      drawing: { default: null, parseHTML: el => { try { return drawingData(JSON.parse(el.getAttribute('data-drawing'))) } catch { return null } }, renderHTML: a => drawingData(a.drawing) ? { 'data-drawing': JSON.stringify(drawingData(a.drawing)) } : {} },
      imageFormat: { default: null, parseHTML: el => { try { return imageFormat(JSON.parse(el.getAttribute('data-image-format'))) } catch { return null } }, renderHTML: a => imageFormat(a.imageFormat) ? { 'data-image-format': JSON.stringify(imageFormat(a.imageFormat)) } : {} },
      fileId: { default: null, parseHTML: el => el.getAttribute('data-file') || null, renderHTML: a => a.fileId ? { 'data-file': a.fileId } : {} },
      source: { default: null, parseHTML: el => markdownURL(el.getAttribute('data-image-source'), true), renderHTML: a => markdownURL(a.source, true) ? { 'data-image-source': markdownURL(a.source, true) } : {} },
      videoSource: { default: null, parseHTML: el => videoSource(el.getAttribute('data-video-source') || (el.matches('iframe,video') ? el.getAttribute('src') : null))?.url || null, renderHTML: a => videoSource(a.videoSource) ? { 'data-video-source': videoSource(a.videoSource).url } : {} },
      label: { default: 'Attachment', parseHTML: el => el.getAttribute('data-filename') || (el.matches('iframe,video') ? 'Video' : 'Attachment'), renderHTML: a => ({ 'data-filename': a.label }) },
      detail: { default: '', parseHTML: el => el.getAttribute('data-detail'), renderHTML: a => ({ 'data-detail': a.detail }) },
      mediaRotation: { default: 0, parseHTML: el => mediaAngle(Number(el.dataset.mediaRotation)), renderHTML: a => mediaAngle(a.mediaRotation) ? { 'data-media-rotation':mediaAngle(a.mediaRotation) } : {} },
      ...placementAttributes,
      width: { default: null, parseHTML: el => Number(el.getAttribute('data-width')) || null, renderHTML: a => a.width ? { 'data-width': a.width } : {} },
    }
  },
  parseHTML() { return [{ tag: 'div[data-filename]' }, ...['iframe[src]','video[src]'].map(tag => ({tag, getAttrs: el => { const source=videoSource(el.getAttribute('src')); return source ? {videoSource:source.url,label:'Video'} : false }}))] },
  renderHTML({ node, HTMLAttributes }) {
    const video=videoSource(node.attrs.videoSource)
    if(video)return ['div',mergeAttributes(HTMLAttributes,{class:'fn-attachment'}),['a',{href:video.url,rel:'noreferrer noopener'},'Video']]
    return ['div', mergeAttributes(HTMLAttributes, { class: 'fn-attachment' }), ['span', node.attrs.label, ['small', node.attrs.detail]]]
  },
  renderText({ node }) { return videoSource(node.attrs.videoSource)?.url || node.attrs.label },
  ...markdownImage,
  addNodeView() {
    const { attachments, icon, onVideo, onImage, videoPreviews = true, root } = this.options
    return ({ node, view, editor, getPos }) => {
      const {fileId,label,detail,layout,width}=node.attrs,file=attachments.get(fileId)
      // A file may still be on its way when the note opens; its address is filled in
      // when it arrives.
      let closed=false
      const whenHere=use=>{if(file?.url)use(file.url);else file?.ready?.then(url=>{if(url&&!closed)use(url)})}
      // An image is shown as the image and nothing else. Other files keep a small
      // card with their name, size and a download link.
      const video=videoSource(node.attrs.videoSource),isVideo=!!video
      const ink=drawingData(node.attrs.drawing)
      const source=markdownURL(node.attrs.source,true),isImage=!ink&&!isVideo&&(!!file?.image||!!source),isVisual=isImage||isVideo||!!ink
      const dom=document.createElement('div')
      dom.className='fn-attachment'+(isVisual?' fn-image':'')+(isVideo?' fn-video':'')+(ink?' fn-drawing':'')
      dom.contentEditable='false'
      applyPlacement(dom,node.attrs)
      if(isVisual)paintRotation(dom,node.attrs.frameRatio,node.attrs.mediaRotation)
      if(width||node.attrs.canvasWidth)dom.style.width=(width||node.attrs.canvasWidth)+'px'
      if(ink)dom.innerHTML=drawingSVG(ink,{interactive:editor.isEditable})
      const player=isVideo?mountVideo(dom,video.url,{preview:videoPreviews,editable:editor.isEditable,onInteractionChange:active=>{
        (objectToolbar(dom)||dom).querySelector('[data-object="interact-video"]')?.setAttribute('aria-pressed',String(active))
      },onSelect:()=>{
        if(closed||!editor.isEditable||view.isDestroyed)return
        const pos=getPos(),{state}=view
        if(typeof pos!=='number'||state.doc.nodeAt(pos)!==node)return
        if(state.selection instanceof NodeSelection&&state.selection.from===pos)return
        view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc,pos)).setMeta('addToHistory',false))
      }}):null
      let syncImage = () => {}
      if(isImage){
        const image=document.createElement('img')
        image.alt=label;image.draggable=false
        syncImage = () => {
          dom.querySelector('.fn-formatted-image')?.remove()
          if (!image.complete || !image.naturalWidth) return
          const format = imageFormat(node.attrs.imageFormat)
          image.hidden = !!format
          if (format) image.insertAdjacentHTML('afterend', formattedImage(image.currentSrc || image.src, format, label))
        }
        image.addEventListener('load', () => { setPictureRatio(image); syncImage() })
        // Keep the picture's place while it loads, so the text does not jump when it arrives.
        const known=pictureSizes.get(fileId)
        if(known){image.width=known[0];image.height=known[1]}
        if(!file?.url&&!source)dom.classList.add('is-loading')
        image.addEventListener('load',()=>{dom.classList.remove('is-loading');pictureSizes.set(fileId,image.naturalWidth,image.naturalHeight)})
        whenHere(url=>{image.src=url})
        dom.append(image)
        if(source){
          image.hidden=true
          const load=document.createElement('button')
          load.type='button';load.className='fn-load-image';load.textContent=`Load ${label} from ${new URL(source).hostname}`
          load.addEventListener('click',event=>{event.stopPropagation();image.referrerPolicy='no-referrer';image.src=source;image.hidden=false;load.remove()})
          image.addEventListener('error',()=>{image.hidden=true;load.textContent='Image unavailable. Try again';dom.append(load)})
          dom.append(load)
        }
      }else if(!isVideo&&!ink){
        const caption=document.createElement('span'),meta=document.createElement('small')
        caption.textContent=label;meta.textContent=detail
        caption.append(meta)
        dom.append(caption)
        if(file){
          const download=document.createElement('a')
          download.download=label;download.dataset.attachmentDownload='';download.textContent='Download'
          whenHere(url=>{download.href=url})
          dom.append(download)
        }
      }
      let mover, resizer
      const controls=[]
      if(icon&&(editor.isEditable||isImage||ink)){
        const bar=document.createElement('div')
        bar.className='fn-object-bar'
        const tool=(name,title,glyph,pressed)=>{
          const button=document.createElement('button')
          button.type='button';button.title=title;button.setAttribute('aria-label',title)
          if(pressed!==undefined)button.setAttribute('aria-pressed',String(pressed))
          button.dataset.object=name;button.innerHTML=icon(glyph)
          bar.append(button)
          return button
        }
        dom.append(bar)
        controls.push(bar)
        bar.addEventListener('mousedown',event=>event.preventDefault())
        if(editor.isEditable){
          // A picture that has not been sized keeps its own width when placed, up to
          // just under half the page; one that has been sized keeps that size.
          const placedWidth=page=>Math.min(Math.round(dom.getBoundingClientRect().width),sideWidth(page))
          const rebuild=(current,placement,page)=>current.type.create({...current.attrs,...placement,
            width:isVisual?(placement.layout&&!current.attrs.width?placedWidth(page):current.attrs.width):null})
          const widthFor=page=>isVisual?(node.attrs.width||placedWidth(page)):dom.getBoundingClientRect().width
          // The picture itself is the handle: press and drag it anywhere. Files have a move button.
          const handle=isVisual?dom:tool('move','Drag to move','move')
          tool('left','Place left, text beside','arrow-left-to-line',layout==='left'&&!node.attrs.offset)
          tool('line','Place on its own line','stretch-horizontal',!layout)
          tool('right','Place right, text beside','arrow-right-to-line',layout==='right'&&!node.attrs.offset)
          mover=createMover({view,dom,handle,getPos,rebuild,widthFor,root,isEditable:()=>editor.isEditable,ignore:target=>!!target.closest?.('.fn-load-image,video,iframe')||controls.some(control=>control.contains(target))&&!(handle!==dom&&handle.contains(target))})
          // The browser's own drag of a selected block would fight the move.
          dom.addEventListener('dragstart',event=>event.preventDefault())
          bar.addEventListener('click',event=>{
            const name=event.target.closest('[data-object]')?.dataset.object
            if(!name||name==='move'||mover.wasDragged())return
            if(name==='format-image'){onImage?.(node,getPos(),dom.querySelector('img'));return}
            if(name==='edit-video'){onVideo?.(node,getPos());return}
            if(name==='stop-video'){player?.reset();selectObject(view,getPos);return}
            if(name==='interact-video'){
              player?.interact(!player.interacting)
              if(!player?.interacting)selectObject(view,getPos)
              return
            }
            if(name==='delete'){removeObject(view,getPos);return}
            place({view,getPos,placement:name==='line'?unplaced:{...unplaced,layout:name},rebuild})
          })
        }
        if(isImage&&editor.isEditable)tool('format-image','Format image','crop')
        if(isVideo&&editor.isEditable){
          tool('interact-video','Use player controls','mouse-pointer-2',false)
          tool('edit-video','Edit video link','link')
          tool('stop-video','Stop video','square')
        }
        if(isImage&&!source){
          const download=document.createElement('a')
          download.download=label;download.dataset.attachmentDownload=''
          whenHere(url=>{download.href=url})
          download.title='Download';download.setAttribute('aria-label','Download '+label)
          download.innerHTML=icon('download')
          bar.append(download)
        }
        if(ink)bar.append(drawingDownloadButton(dom,()=>node.attrs,icon))
        if(editor.isEditable)tool('delete',ink?'Delete drawing':isVideo?'Delete video':isImage?'Delete image':'Delete attachment','trash-2')
        if(editor.isEditable){
          const label = isVideo ? 'video' : ink ? 'drawing' : isImage ? 'image' : 'file'
          const grips = resizeHandles(dom, label, icon, isVisual)
          let rotate
          if (isVisual) {
            rotate = document.createElement('button')
            rotate.type = 'button'; rotate.className = 'fn-media-rotate'; rotate.dataset.resizeAxis = 'rotate'
            rotate.title = 'Click to rotate 90°. Drag to rotate freely. Hold Shift for 15° steps.'
            rotate.setAttribute('aria-label','Rotate '+label); rotate.innerHTML = icon('rotate-cw')
            dom.append(rotate); grips.push(rotate)
            rotate.addEventListener('click', event => {
              event.stopPropagation()
              if (!editor.isEditable) return
              const start = startMediaTransform(dom,view,node.attrs,{x:0,y:0})
              commit(mediaPlacement(start,start.size,start.degrees+90,true).attrs)
              selectObject(view,getPos,false)
              rotate.focus({preventScroll:true})
            })
          }
          controls.push(...grips)
          const commit = (changes, transaction) => {
            const pos = getPos(), tr = transaction || closeHistory(view.state.tr)
            const current = typeof pos === 'number' && tr.doc.nodeAt(pos)
            if (!current || current.type !== node.type) return
            tr.setNodeMarkup(pos, null, { ...current.attrs, ...changes })
            if (!transaction) { view.dispatch(tr); view.dispatch(closeHistory(view.state.tr)) }
          }
          resizer = createObjectResizer({view, dom, handles: grips, getPos, isEditable: () => editor.isEditable,
            begin: (axis, pointer) => {
              if (isVisual) {
                const media = startMediaTransform(dom,view,node.attrs,pointer)
                if (!media.rect.width || !media.rect.height) return null
                return {media, axes:mediaAxes(media.degrees), changes:{}}
              }
              const rect = dom.getBoundingClientRect(), page = view.dom.getBoundingClientRect()
              if (!rect.width || !rect.height) return null
              const right = getComputedStyle(dom).float === 'right'
              return { rect, right, maximum: Math.max(1, right ? rect.right-page.left : page.right-rect.left), changes: {} }
            },
            preview: (data, dx, dy, axis, gesture) => {
              if (data.media) {
                const start = data.media, rotating = axis === 'rotate'
                let degrees = start.degrees, size = start.size
                if (rotating) {
                  if (gesture.pointer === null) degrees += dx || -dy
                  else {
                    if (!gesture.dragged) return
                    const angle = Math.atan2(gesture.y+dy-start.cy,gesture.x+dx-start.cx)
                    degrees += (angle-start.startAngle)*180/Math.PI
                    if (gesture.shift) degrees = Math.round(degrees/15)*15
                  }
                } else {
                  const maximum = start.degrees ? 10000 : Math.max(1,start.page.right-start.rect.left)
                  size = visualSize(size,axis,dx,dy,maximum,ink?4:24,ink?4:24)
                }
                const change = mediaPlacement(start,size,mediaAngle(degrees),rotating)
                previewMedia(dom,change,start.positioned)
                data.changes = change.attrs
                return
              }
              if (data.right) dx = -dx
              const changes = {}
              if (axis !== 'height') {
                changes.width = changes.canvasWidth = resizeLength(data.rect.width+dx,96,data.maximum)
                dom.style.width = changes.width+'px'
              }
              if (axis !== 'width' && dy) {
                changes.minHeight = resizeLength(data.rect.height+dy,1)
                dom.style.setProperty('--fn-min-height',changes.minHeight+'px')
              }
              data.changes = changes
            },
            commit: (data, tr) => commit(data.changes, tr),
          })
          for (const grip of grips.filter(handle => handle !== rotate)) grip.addEventListener('dblclick', async () => {
            if (!editor.isEditable) return
            const axis = grip.dataset.resizeAxis
            if (!isVisual) {
              const changes = axis === 'width' ? {} : { minHeight: 0 }
              if (axis !== 'height') {
                changes.canvasWidth = node.attrs.layout === 'canvas' ? fittedWidth(dom) : 0
                changes.width = changes.canvasWidth || null
              }
              commit(changes)
              return
            }
            if (axis !== 'corner' && !node.attrs.mediaRotation) { commit({ frameRatio: 0 }); return }
            let natural = ink?.width || (isVideo ? 480 : dom.clientWidth)
            const format = imageFormat(node.attrs.imageFormat)
            const image = dom.querySelector(':scope > img')
            const videoRatio = Number(dom.querySelector('.fn-video-surface')?.style.getPropertyValue('--fn-video-ratio'))
            let ratio = ink ? ink.width/ink.height : videoRatio || (video?.ratio === 'portrait' ? 9/16 : 16/9)
            if (format) {
              natural = (format.rotation % 180 ? format.naturalHeight : format.naturalWidth) * format.width
              ratio = natural / ((format.rotation % 180 ? format.naturalWidth : format.naturalHeight) * format.height)
            }
            else if (image?.complete && image.naturalWidth && image.currentSrc) {
              // WebKit can report the styled SVG viewport as naturalWidth.
              // Decode the already loaded source outside its custom frame.
              const before = node, original = new Image()
              original.referrerPolicy = image.referrerPolicy
              original.src = image.currentSrc
              try { await original.decode() } catch {}
              if (closed || view.isDestroyed || !editor.isEditable || node !== before) return
              natural = original.naturalWidth || image.naturalWidth
              ratio = natural / (original.naturalHeight || image.naturalHeight)
            }
            const width = Math.min(ink ? node.attrs.drawingPageWidth || view.dom.clientWidth : view.dom.clientWidth, natural)
            if (node.attrs.mediaRotation) {
              const start = startMediaTransform(dom,view,node.attrs,{x:0,y:0})
              const localWidth = axis === 'corner' ? width*start.pageScale : start.size.width
              commit(mediaPlacement(start,{width:localWidth,height:localWidth/ratio},start.degrees,true).attrs)
            } else commit({ width, canvasWidth: width, frameRatio: 0 })
          })
        }
      }
      // Hit targets can extend beyond the visual bounds of a thin stroke. Pick
      // this exact node instead of asking coordinates to guess a nearby paragraph.
      if(editor.isEditable)dom.addEventListener('click',event=>{
        if(mover?.wasDragged()||controls.some(control=>control.contains(event.target))||event.target.closest?.('.fn-load-image,.fn-video-play,video,iframe,a'))return
        event.preventDefault();event.stopPropagation();selectObject(view,getPos)
      })
      const releaseTools=controls[0]?.classList.contains('fn-object-bar')?floatObjectTools(editor,view,dom,controls[0],root):()=>{}
      return {
        dom,
        stopEvent: event => !!event.target.closest?.('[data-attachment-download],.fn-load-image,.fn-video-play,video,iframe') || controls.some(control => control.contains(event.target)),
        ignoreMutation: () => true,
        // Nudged to make room for another object: take the new numbers in place.
        update: next => {
          const a=node.attrs,b=next.attrs
          if(next.type!==node.type||a.fileId!==b.fileId||a.source!==b.source||a.videoSource!==b.videoSource||a.drawing!==b.drawing||a.label!==b.label||a.detail!==b.detail)return false
          node=next
          syncImage()
          applyPlacement(dom,b)
          if(isVisual)paintRotation(dom,b.frameRatio,b.mediaRotation)
          const nextWidth = (isVisual && b.width) || b.canvasWidth
          dom.style.width = nextWidth ? nextWidth + 'px' : ''
          for(const button of (objectToolbar(dom)||dom).querySelectorAll('[data-object]')){
            const name=button.dataset.object
            if(['move','edit-video','stop-video','interact-video','format-image','delete'].includes(name))continue
            button.setAttribute('aria-pressed',String(name==='line'?!b.layout:b.layout===name&&!b.offset))
          }
          return true
        },
        destroy: () => { closed=true; releaseTools(); mover?.destroy(); resizer?.destroy(); player?.destroy() },
      }
    }
  },
})

const NoteReference=Node.create({
  name:'noteReference',
  group:'inline',
  inline:true,
  atom:true,
  addAttributes(){
    return {noteId:{default:null,rendered:false},label:{default:'Linked note',rendered:false}}
  },
  renderHTML({node}){return ['span',{class:'fn-note-ref'},node.attrs.label]},
  renderText({node}){return node.attrs.label},
  addNodeView(){
    const {openNote,resolveNote}=this.options
    return ({node})=>{
      const dom=document.createElement('button')
      dom.type='button';dom.className='fn-note-ref';dom.contentEditable='false'
      dom.textContent=resolveNote(node.attrs.noteId)||node.attrs.label
      dom.addEventListener('click',()=>openNote(node.attrs.noteId))
      return {dom,stopEvent:()=>true}
    }
  },
})

export function websiteAddress(input) {
  const text = input.trim()
  if (!text || /\s/.test(text)) return null
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : 'https://' + text)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch { return null }
}

export const marks = [
  ['bold', 'Bold', 'bold'], ['italic', 'Italic', 'italic'], ['underline', 'Underline', 'underline'], ['strike', 'Strikethrough', 'strikethrough'], ['highlight', 'Highlight', 'highlighter'], ['code', 'Inline code', 'code'],
]
export const styles = [
  ['paragraph', 'Body', 'type'], ...Array.from({length:6},(_,i)=>['h'+(i+1),'Heading '+(i+1),'heading-'+(i+1)]),
]
export const inserts = [
  ['drawing','Draw on page','pencil'],
  ['checklist', 'Checklist', 'list-checks', 'task todo'],
  ['bullets', 'Bulleted list', 'list', 'bullet'],
  ['numbered', 'Numbered list', 'list-ordered', 'ordered'],
  ['table', 'Table', 'table-2', 'grid'],
  ['video', 'Video', 'video', 'youtube vimeo movie embed'],
  ['quote', 'Quote', 'quote', 'blockquote'],
  ['codeBlock', 'Code block', 'square-code', 'monospaced'],
  ['divider', 'Divider', 'minus', 'line rule'],
  ['section', 'Collapsible section', 'panel-top-open', 'heading fold'],
]
const slashItems = [...styles.slice(1), ...inserts]

// When only part of one paragraph is selected, give that part its own paragraph
// first, so a block format applies to exactly what was selected and no more.
const isolate = c => c.command(({ tr, dispatch }) => {
  const { $from, $to, empty } = tr.selection
  if (empty || !$from.sameParent($to) || $from.parent.type.name !== 'paragraph') return true
  if ($from.parentOffset === 0 && $to.parentOffset === $to.parent.content.size) return true
  if (dispatch) {
    let { from, to } = tr.selection
    // Spaces at the edges of the selection stay with neither part.
    while (to - from > 1 && tr.doc.textBetween(to - 1, to) === ' ') to--
    while (to - from > 1 && tr.doc.textBetween(from, from + 1) === ' ') from++
    // Split after, then before; a space left at either cut is dropped.
    if (tr.doc.resolve(to).parentOffset < $to.parent.content.size) {
      if (tr.doc.textBetween(to, to + 1) === ' ') tr.delete(to, to + 1)
      if (tr.doc.resolve(to).parentOffset < tr.doc.resolve(to).parent.content.size) tr.split(to)
    }
    if (tr.doc.resolve(from).parentOffset > 0) {
      if (tr.doc.textBetween(from - 1, from) === ' ') { tr.delete(from - 1, from); from--; to-- }
      if (tr.doc.resolve(from).parentOffset > 0) { tr.split(from); from += 2; to += 2 }
    }
    tr.setSelection(TextSelection.create(tr.doc, from, to))
  }
  return true
})

const actions = {
  ...Object.fromEntries(Array.from({length:6},(_,i)=>['h'+(i+1),c=>c.toggleHeading({level:i+1})])),
  bold: c => c.toggleBold(), italic: c => c.toggleItalic(), underline: c => c.toggleUnderline(),
  strike: c => c.toggleStrike(), highlight: c => c.toggleHighlight(), code: c => c.toggleCode(),
  clear: c => c.unsetAllMarks().clearNodes(),
  paragraph: c => c.setParagraph(), heading: c => c.toggleHeading({ level: 2 }),
  subheading: c => c.toggleHeading({ level: 3 }),
  checklist: c => c.toggleTaskList(), bullets: c => c.toggleBulletList(), numbered: c => c.toggleOrderedList(),
  quote: c => isolate(c).toggleBlockquote(), codeBlock: c => isolate(c).toggleCodeBlock(),
  divider: insertDivider,
  table: c => c.command(({ tr, chain }) => {
    if (tr.selection.empty) return chain().insertTable({rows:2,cols:2,withHeaderRow:false}).run()
    const {from,to}=tr.selection,lines=tr.doc.textBetween(from,to,'\n','').split('\n').filter(Boolean)
    if (!lines.length) return chain().insertTable({rows:2,cols:2,withHeaderRow:false}).run()
    const rows=lines.map(line=>line.split('\t')),cols=Math.max(2,...rows.map(row=>row.length))
    return chain().insertContent({type:'table',content:rows.map(row=>({type:'tableRow',content:Array.from({length:cols},(_,i)=>({type:'tableCell',content:[{type:'paragraph',content:row[i]?[{type:'text',text:row[i]}]:[]}]}))}))}).run()
  }),
  section:c=>c.command(({tr,chain})=>{
    const {from,to,empty,$from}=tr.selection
    if($from.depth!==1||$from.parent.type.name!=='paragraph')return false
    const text=empty?'':tr.doc.textBetween(from,to,' ')
    if(!empty)return chain().setDetails().run()
    if($from.parent.content.size)return chain().setDetails().run()
    return chain().insertContent({type:'details',attrs:{open:true},content:[{type:'detailsSummary',content:[{type:'text',text:text||'Section title'}]},{type:'detailsContent',content:[{type:'paragraph'}]}]}).setTextSelection(from+1).run()
  }),
  'table-header': c => c.toggleHeaderRow(),
  'table-to-text': c => c.convertTableToText(),
  'table-delete': c => c.deleteTable(),
  undo: c => c.undo(), redo: c => c.redo(),
}

export function commandState(editor, action) {
  if (/^h[1-6]$/.test(action)) return editor.isActive('heading', { level: Number(action[1]) })
  if (action === 'heading' || action === 'subheading') return editor.isActive('heading', { level: action === 'heading' ? 2 : 3 })
  return editor.isActive(({ checklist: 'taskList', bullets: 'bulletList', numbered: 'orderedList', quote: 'blockquote' })[action] ?? action)
}

export const runEditorCommand = (editor, action) => actions[action]?.(editor.chain().focus()).run()

export function followEditorLink(dom, address) {
  const href = markdownURL(address)
  if (!href) return
  if (href.startsWith('#')) {
    // The host may use its URL fragment to identify the open note.
    dom.querySelector('#' + CSS.escape(href.slice(1)))?.scrollIntoView({block:'center'})
  } else {
    dom.ownerDocument.defaultView.open(href, '_blank', 'noopener,noreferrer')
  }
}

export function linkSelection(editor) {
  const { $from, from, to, empty } = editor.state.selection
  return empty && editor.isActive('link')
    ? getMarkRange($from, editor.schema.marks.link, editor.getAttributes('link')) ?? { from, to }
    : { from, to }
}

function slashCommands(root, icon, onOpen, onVideo) {
  return Extension.create({
    name: 'noteInsert',
    addProseMirrorPlugins() {
      return [Suggestion({
        editor: this.editor,
        char: '/',
        startOfLine: true,
        allow: ({ state, range }) => {
          const parent = state.doc.resolve(range.from).parent
          return parent.type.name === 'paragraph' && !state.doc.resolve(range.from).parentOffset
        },
        container: root,
        floatingUi: { strategy: 'fixed' },
        items: ({ query }) => slashItems.filter(item => item.slice(0, 2).join(' ').toLowerCase().includes(query.toLowerCase()) || item[3]?.includes(query.toLowerCase())),
        command: ({ editor, range, props }) => {
          if(props[0]==='drawing'){editor.chain().focus().deleteRange(range).run();startDrawing(editor,root);return}
          if(props[0]==='video'){editor.chain().focus().deleteRange(range).run();onVideo?.();return}
          actions[props[0]](editor.chain().focus().deleteRange(range)).run()
        },
        render: () => {
          let el, unmount, current, releaseMenu, active = 0
          const draw = () => {
            el.innerHTML = '<div class="fn-menu-label">Insert in note</div>' + (current.items.length
              ? current.items.map(([, label, glyph], index) => `<button type="button" data-index="${index}" class="${index === active ? 'is-highlighted' : ''}">${icon(glyph)}${label}</button>`).join('')
              : '<div class="fn-menu-empty">No matching items</div>')
            el.querySelector('.is-highlighted')?.scrollIntoView({ block: 'nearest', container: 'nearest' })
          }
          return {
            onStart(props) {
              current = props
              active = 0
              el = document.createElement('div')
              el.className = 'fn-popover fn-slash'
              el.setAttribute('role', 'group')
              el.setAttribute('aria-label', 'Quick insert')
              el.addEventListener('mousedown', event => event.preventDefault())
              el.addEventListener('click', event => {
                const button = event.target.closest('[data-index]')
                if (button) current.command(current.items[Number(button.dataset.index)])
              })
              draw()
              unmount = props.mount(el)
              releaseMenu = onOpen?.(() => exitSuggestion(props.editor.view))
            },
            onUpdate(props) {
              if (props.query !== current.query) active = 0
              current = props
              active = Math.max(0, Math.min(active, props.items.length - 1))
              draw()
            },
            onKeyDown({ event }) {
              if (event.isComposing || !current?.items.length) return false
              if (event.key === 'Enter') { current.command(current.items[active]); return true }
              if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
                active = (active + current.items.length + (event.key === 'ArrowDown' ? 1 : -1)) % current.items.length
                draw()
                return true
              }
              return false
            },
            onExit() { releaseMenu?.(); unmount?.(); unmount = undefined; current = undefined },
          }
        },
      })]
    },
  })
}

// Prepare a saved document for this editor: older formats are upgraded, and a
// document from a newer editor is reduced to what this one can display.
export const loadableDocument = doc => isNewerFormat(doc) ? displayableDocument(doc) : migrateDocument(doc)

export function createNotebook({ body, root, content, editable = true, icon, onEdit, onSelection, onLink, onMath, onVideo, onImage, videoPreviews = true, onOpen, attachments, openNote, resolveNote, attachFiles }) {
  // A document saved by a newer editor always opens read-only, so this editor
  // can never save over content it does not understand. Apps should also show
  // why (see isNewerFormat) and must not switch such an editor to editable.
  const editor = new Editor({
    element: body,
    content: loadableDocument(content),
    editable: editable && !isNewerFormat(content),
    injectCSS: true,
    // MarkdownPaste handles plain text once. Mark-level paste rules would
    // otherwise format even Shift-paste, which must remain literal.
    enablePasteRules: false,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        horizontalRule: false,
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        link: {
          defaultProtocol: 'https',
          isAllowedUri: (url, ctx) => Boolean(markdownURL(url)) && ctx.defaultValidate(url),
          openOnClick: false, enableClickSelection: false,
        },
      }),
      DocumentFormat,
      ObjectKeys,
      NoteCodeBlock.configure({ icon, root }),
      NoteDivider,
      TaskList,
      TaskItem.configure({ nested: true, a11y: { checkboxLabel: node => node.firstChild?.textContent || 'Checklist item' } }),
      TextStyle,
      TextHighlight,
      NoteMarkdown, MarkdownPaste,
      SafeBlockHTML.configure({getSchema:()=>editor.schema}), SafeInlineHTML.configure({getSchema:()=>editor.schema}), LiteralHTML,
      NoteInlineMath.configure({onClick:onMath}), NoteBlockMath.configure({onClick:onMath}),
      FootnoteReference, FootnoteDefinition, Superscript, Subscript,
      Placeholder.configure({ placeholder: 'Start writing…  Type / to insert', showOnlyCurrent: false }),
      CanvasFlow, ObjectDeletion,
      TableKit.configure({ table: false }),
      TableAppearance,
      NoteTable.configure({onOpen,root}),
      Attachment.configure({ attachments, icon, onVideo, onImage, videoPreviews, root }),
      NoteReference.configure({openNote,resolveNote}),
      Details.configure({persist:true}),
      DetailsContent,
      DetailsSummary,
      slashCommands(root, icon, onOpen, onVideo),
      Extension.create({
        name: 'noteShortcuts',
        addKeyboardShortcuts() { return { 'Mod-k': () => { onLink(); return true } } },
      }),
    ],
    editorProps: {
      attributes: { role: 'textbox', 'aria-label': 'Note content', 'aria-multiline': 'true', spellcheck: 'true' },
      handlePaste(_view,event) {
        const data=event.clipboardData,files=[...(data?.files||[])]
        if(!editable||!files.length)return false
        // A copied picture often arrives as a file plus a scrap of HTML that only points at it.
        const html=data.getData('text/html')
        const pictureOnly=html&&files.every(file=>file.type.startsWith('image/'))&&!html.replace(/<[^>]*>/g,'').trim()
        if(html&&!pictureOnly)return false
        attachFiles(files)
        return true
      },
      // A copy carries the size its original is shown at. A picture or table whose
      // size was never set takes it from its surroundings, so without this the
      // paste could come out a different size from the thing that was copied.
      transformCopied(slice,view) {
        const shown=[]
        const {from,to}=view.state.selection
        view.state.doc.nodesBetween(from,to,(node,pos)=>{
          const name=node.type.name
          if(name!=='previewAttachment'&&name!=='table')return true
          const dom=view.nodeDOM(pos),size={name}
          if(dom instanceof HTMLElement&&name==='previewAttachment'){
            if(dom.classList.contains('fn-image')&&!node.attrs.width)size.width=Math.round(dom.getBoundingClientRect().width)
          }else if(dom instanceof HTMLElement){
            // A table that spans the page stays fluid; a narrower one keeps its columns.
            const table=dom.querySelector('table'),map=TableMap.get(node)
            let sized=true
            node.descendants(cell=>{if(cell.type.spec.tableRole==='cell'||cell.type.spec.tableRole==='header_cell'){if(!cell.attrs.colwidth||cell.attrs.colwidth.some(width=>!width))sized=false;return false}return true})
            if(table&&!sized&&table.getBoundingClientRect().width<view.dom.clientWidth-4){
              const columns=[]
              for(let column=0;column<map.width;column++){
                let width=0
                for(let row=0;row<map.height&&!width;row++){
                  const at=map.map[row*map.width+column],cell=node.nodeAt(at),cellDOM=view.nodeDOM(pos+1+at)
                  if(cell&&(cell.attrs.colspan||1)===1&&cellDOM instanceof HTMLElement)width=Math.round(cellDOM.getBoundingClientRect().width)
                }
                columns.push(width||Math.round(table.getBoundingClientRect().width/map.width))
              }
              size.columns=columns
            }
          }
          shown.push(size)
          return false
        })
        const next=name=>{const index=shown.findIndex(size=>size.name===name);return index<0?null:shown.splice(index,1)[0]}
        const stamp=fragment=>{
          const nodes=[]
          fragment.forEach(node=>{
            const name=node.type.name
            if(name==='previewAttachment'){
              const size=next(name)
              nodes.push(size?.width?node.type.create({...node.attrs,width:size.width}):node)
            }else if(name==='table'){
              const size=next(name)
              if(!size?.columns){nodes.push(node);return}
              const map=TableMap.get(node),rows=[]
              node.forEach((row,rowOffset)=>{
                const cells=[]
                row.forEach((cell,cellOffset)=>{
                  const {left}=map.findCell(rowOffset+1+cellOffset),span=cell.attrs.colspan||1
                  cells.push(cell.type.create({...cell.attrs,colwidth:size.columns.slice(left,left+span)},cell.content,cell.marks))
                })
                rows.push(row.type.create(row.attrs,cells,row.marks))
              })
              nodes.push(node.type.create(node.attrs,rows,node.marks))
            }else nodes.push(node.content.size?node.copy(stamp(node.content)):node)
          })
          return Fragment.fromArray(nodes)
        }
        try{return new Slice(stamp(slice.content),slice.openStart,slice.openEnd)}catch{return slice}
      },
      // A pasted picture, file or table is a second copy: it keeps its size but not
      // its position. A picture or file whose data is not in this note is left out,
      // since there is nothing to show for it.
      transformPasted(slice,view) {
        let index=0
        const clean=fragment=>{
          const nodes=[]
          fragment.forEach(node=>{
            if(node.type.name==='previewAttachment'){
              if(drawingData(node.attrs.drawing)||attachments.has(node.attrs.fileId)||markdownURL(node.attrs.source,true)||videoSource(node.attrs.videoSource))nodes.push(node.type.create(node.attrs.documentFlow?node.attrs:{...node.attrs,...unplaced,canvasWidth:node.attrs.canvasWidth,...canvasPastePlacement(view,node.attrs.width||node.attrs.canvasWidth,index++)}))
            }else if(node.type.name==='codeBlock'&&node.attrs.layout){
              nodes.push(node.type.create({...node.attrs,...unplaced,canvasWidth:node.attrs.canvasWidth,...canvasPastePlacement(view,node.attrs.canvasWidth,index++)},node.content,node.marks))
            }else if(node.type.name==='table'){
              const first=node.firstChild,columns=[]
              first?.forEach(cell=>columns.push(...(cell.attrs.colwidth||[])))
              const width=columns.length?columns.reduce((sum,width)=>sum+width,0)+2:node.attrs.canvasWidth
              nodes.push(node.type.create(node.attrs.documentFlow?node.attrs:{...node.attrs,...unplaced,...canvasPastePlacement(view,width,index++)},clean(node.content),node.marks))
            }else nodes.push(node.content.size?node.copy(clean(node.content)):node)
          })
          return Fragment.fromArray(nodes)
        }
        return new Slice(clean(slice.content),slice.openStart,slice.openEnd)
      },
      handleDOMEvents:{
        click:(view,event)=>{
          const link = event.target.closest?.('a[href]:not([data-attachment-download])')
          if (!link || event.defaultPrevented || event.button !== 0) return false
          event.preventDefault()
          const selection = view.dom.ownerDocument.getSelection()
          const selectingText = selection && !selection.isCollapsed && selection.containsNode(link, true) && !link.closest('[data-footnote-ref]')
          if (!event.shiftKey && (event.detail === 0 || !selectingText)) {
            followEditorLink(view.dom, link.getAttribute('href'))
          }
          return true
        },
      },
    },
    onUpdate: ({ editor }) => onEdit(editor),
    onTransaction: ({ editor }) => onSelection(editor),
    onFocus: ({ editor }) => onSelection(editor),
    onBlur: ({ editor }) => onSelection(editor),
  })
  // Keep text out of pockets too narrow to read, whenever the layout may have
  // changed: an edit, a picture arriving, the page or the text size changing.
  let tidying = 0
  const tidy = () => { tidying ||= requestAnimationFrame(() => { tidying = 0; if (!editor.isDestroyed) tidyChannels(editor.view) }) }
  const watcher = new ResizeObserver(tidy)
  watcher.observe(editor.view.dom)
  editor.view.dom.addEventListener('load', tidy, true)
  editor.on('update', tidy)
  editor.on('destroy', () => { watcher.disconnect(); cancelAnimationFrame(tidying) })
  tidy()
  return editor
}

export function renderNotebookDocument(editor, doc) {
  const container = document.createElement('div')
  const content = editor.schema.nodeFromJSON(loadableDocument(doc)).content
  container.append(DOMSerializer.fromSchema(editor.schema).serializeFragment(content))
  container.querySelectorAll('a').forEach(link => link.removeAttribute('href'))
  container.querySelectorAll('input, button').forEach(control => { control.disabled = true })
  return container.innerHTML
}
