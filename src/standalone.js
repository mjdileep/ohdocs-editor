import { createNotebook, linkSelection, websiteAddress } from './editor.js'
import { createEditorControls, editorContext } from './editor-controls.js'
import { createContextMenu } from './context-menu.js'
import { createSpellingClient } from './spelling-client.js'
import { spellingActions, spellingTarget } from './spelling.js'
import { objectFromTarget } from './object-tools.js'
import { editImage } from './image-editor.js'
import { insertMarkdown } from './markdown.js'
import { videoSource } from '../format/video.mjs'
import { icon } from './icons.js'

export { FORMAT_VERSION, isNewerFormat } from '../format/schema.mjs'
export { createNotebook, insertMarkdown, icon }

const emptyDoc = {type: 'doc', content: [{type: 'paragraph'}]}
const escape = text => String(text).replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[char])
let nextId = 0

/** Mount the full editor into an empty element. Each instance owns its UI and object URLs. */
export function createEditor(host, options = {}) {
  if (host.childNodes.length) throw new Error('Mount the editor in an empty element.')
  const root = document.createElement('section')
  root.className = 'oh-editor'
  root.innerHTML = '<div class="fn-formatbar"></div><div class="fn-note-content"><div class="oh-page"><div class="fn-editor"></div></div></div><input type="file" multiple hidden><div class="oh-feedback" role="status"></div>'
  host.append(root)
  const body = root.querySelector('.fn-editor'), bar = root.querySelector('.fn-formatbar')
  const picker = root.querySelector('input'), feedback = root.querySelector('[role=status]')
  const menu = document.createElement('div')
  menu.className = 'fn-popover fn-format-options'
  menu.id = 'oh-format-' + ++nextId
  menu.hidden = true
  const files = new Map(options.files || []), attachments = new Map()
  function register(id, file) {
    attachments.set(id, {url: URL.createObjectURL(file), image: file.type.startsWith('image/')})
  }
  for (const [id, file] of files) register(id, file)
  let editor, controls, context, activeLayer, dialog, messageTimer
  const getEditor = () => editor
  function toast(message) {
    feedback.textContent = message
    clearTimeout(messageTimer)
    messageTimer = setTimeout(() => { feedback.textContent = '' }, 4000)
  }
  function openLayer(close) {
    activeLayer?.()
    activeLayer = close
    return () => { if (activeLayer === close) activeLayer = null }
  }
  function closeDialog() { dialog?.close() }
  function showDialog(title, markup, submit) {
    closeDialog()
    const box = document.createElement('dialog')
    box.setAttribute('aria-label', title)
    box.innerHTML = '<form>' + markup + '<span class="oh-error" role="alert"></span></form>'
    root.append(box)
    box.querySelector('form').onsubmit = event => {
      event.preventDefault()
      try { submit(new FormData(event.target)) }
      catch (error) { box.querySelector('[role=alert]').textContent = error.message }
    }
    box.querySelector('[data-close-action]')?.addEventListener('click', () => box.close())
    box.addEventListener('close', () => { box.remove(); if (dialog === box) dialog = null }, {once:true})
    dialog = box
    box.showModal()
    return box
  }
  function field(title, value, apply, multiline = false) {
    if (!editor?.isEditable) return
    const tag = multiline ? '<textarea name="value" rows="7"></textarea>' : '<input name="value">'
    const box = showDialog(title, '<label>' + title + tag + '</label><footer><button type="button" data-close-action>Cancel</button><button>Apply</button></footer>', data => {
      apply(String(data.get('value')))
      closeDialog()
    })
    const input = box.querySelector('[name=value]')
    input.value = value || ''
    input.focus()
    input.select()
  }
  function onLink() {
    const range = linkSelection(editor)
    field('Link address', editor.getAttributes('link').href, value => {
      const chain = editor.chain().focus().setTextSelection(range)
      if (!value.trim()) { chain.unsetLink().run(); return }
      const url = websiteAddress(value)
      if (!url) throw new Error('Enter a valid web address.')
      if (range.from === range.to) chain.insertContent({type:'text', text:url, marks:[{type:'link', attrs:{href:url}}]}).run()
      else chain.setLink({href:url}).run()
    })
  }
  function onVideo(node, pos) {
    field('Video URL', node?.attrs.videoSource, value => {
      const video = videoSource(value)
      if (!video) throw new Error('Enter a YouTube, Vimeo, or direct video URL.')
      if (node) editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, null, {...node.attrs, videoSource:video.url}))
      else editor.chain().focus().insertContent({type:'previewAttachment', attrs:{videoSource:video.url, label:'Video', width:video.ratio === 'portrait' ? 270 : 480}}).run()
    })
  }
  function attachFiles(list) {
    if (!editor?.isEditable) return
    const nodes = Array.from(list, file => {
      const id = crypto.randomUUID()
      files.set(id, file)
      register(id, file)
      return {type:'previewAttachment', attrs:{fileId:id, label:file.name || 'File', detail:Math.max(1,Math.round(file.size/1024)) + ' KB'}}
    })
    if (nodes.length) editor.chain().focus().insertContent(nodes).run()
  }
  picker.onchange = () => { attachFiles(picker.files); picker.value = '' }
  editor = createNotebook({
    body, root, icon, content:options.content ?? emptyDoc, editable:options.editable ?? true,
    attachments, attachFiles, onVideo, onLink, onOpen:openLayer,
    onImage:(node, position, image) => editImage({editor, node, position, image, showDialog, closeDialog}),
    onMath:(node, pos) => field('LaTeX equation', node.attrs.latex, latex => {
      editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, null, {...node.attrs, latex}))
    }, true),
    openNote:options.openNote ?? (() => {}), resolveNote:options.resolveNote ?? (() => null),
    videoPreviews:options.videoPreviews ?? false,
    onEdit:current => options.onChange?.(current), onSelection:() => controls?.schedule()
  })
  const spelling = createSpellingClient({url:options.spellingWorkerURL ?? new URL('./spelling-worker.js', import.meta.url)})
  controls = createEditorControls({
    root, body, bar, menu, getEditor, onOpen:openLayer, isContextOpen:() => !!context?.isOpen(),
    onLink, onVideo, onAttach:() => picker.click(), onNoteLink:options.onNoteLink,
    onMarkdown:() => field('Insert Markdown', '', value => insertMarkdown(editor, value), true)
  })
  controls.build()
  bar.hidden = !editor.isEditable
  context = createContextMenu({root, esc:escape, beforeOpen:controls.close, onOpen:openLayer, isEnabled:() => editor.isEditable,
    resolve(target, point) {
      const object = objectFromTarget(target)
      if (!object && !target.closest('.tiptap')) return
      const word = !object && spellingTarget(editor, target, point)
      return {label:object ? 'Object actions' : 'Text actions', items:editorContext(target, point, {getEditor, onLink, toast, schedule:controls.schedule}),
        hideLabel:!!word, leadingItems:word ? spellingActions({editor, word, getEditor, check:spelling.check, toast}) : null}
    }
  })
  body.addEventListener('dragover', event => {
    if (editor.isEditable && event.dataTransfer?.types.includes('Files')) event.preventDefault()
  })
  body.addEventListener('drop', event => {
    if (!editor.isEditable || !event.dataTransfer?.files.length) return
    event.preventDefault()
    event.stopPropagation()
    const hit = editor.view.posAtCoords({left:event.clientX, top:event.clientY})
    if (hit) editor.commands.setTextSelection(hit.pos)
    attachFiles(event.dataTransfer.files)
  }, true)
  editor.on('destroy', () => {
    controls.destroy()
    context.destroy()
    spelling.dispose()
    closeDialog()
    clearTimeout(messageTimer)
    for (const attachment of attachments.values()) URL.revokeObjectURL(attachment.url)
    root.remove()
  })
  // A snapshot only includes blobs still referenced by the current document.
  // Keep removed ones in memory so undo can bring them back.
  function snapshot() {
    const used = new Map()
    editor.state.doc.descendants(node => {
      const id = node.attrs.fileId
      if (id && files.has(id)) used.set(id, files.get(id))
    })
    return {doc:editor.getJSON(), files:used}
  }
  return {editor, snapshot, destroy:() => editor.destroy()}
}
