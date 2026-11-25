import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { codeLanguage, codeLanguageLabel, codeLanguages, createCodeHighlighter } from '../format/code-highlighting.mjs'
export { codeLanguage, codeLanguageLabel, codeLanguages, codeHighlightLimit, detectCodeLanguage, createCodeHighlighter } from '../format/code-highlighting.mjs'
import { TextSelection } from '@tiptap/pm/state'
import { closeHistory } from '@tiptap/pm/history'
import { placementAttributes, applyPlacement, createMover } from './placement.js'
import { createObjectResizer, resizeHandles, resizeLength, fittedWidth } from './object-resize.js'
import { selectObject } from './object-selection.js'

// Language classes belong to the renderer, not the document. Re-reading them
// as content edits can replace a selected object elsewhere with a text caret.
// Keep observing the code's actual text, child nodes and native selection.
export function ignoreCodeMutation(code, mutation) {
  return mutation.type !== 'selection' &&
    (!code.contains(mutation.target) || mutation.type === 'attributes' && mutation.target === code && mutation.attributeName === 'class')
}

export function changeCodeLanguage(editor, pos, value) {
  if (!editor.isEditable || !Number.isInteger(pos)) return false
  const node = editor.state.doc.nodeAt(pos), language = codeLanguage(value)
  if (node?.type.name !== 'codeBlock' || !codeLanguages.some(([value]) => value === language)) return false
  if (codeLanguage(node.attrs.language) === language) return true
  const tr = closeHistory(editor.state.tr).setNodeMarkup(pos, undefined, { ...node.attrs, language: language === 'auto' ? null : language })
  const { from, to } = tr.selection
  // A language picker can belong to a different block than the current caret.
  if (from < pos + 1 || to > pos + node.nodeSize - 1) tr.setSelection(TextSelection.create(tr.doc, pos + 1))
  editor.view.dispatch(tr)
  editor.view.dispatch(closeHistory(editor.state.tr))
  return true
}

export const NoteCodeBlock = CodeBlockLowlight.extend({
  addOptions() { return { ...this.parent?.(), defaultLanguage: null, icon: null, root: null } },
  addAttributes() { return { ...this.parent?.(), ...placementAttributes, documentFlow: { ...placementAttributes.documentFlow, default: true, parseHTML: element => !element.hasAttribute('data-layout') || element.hasAttribute('data-document-flow') } } },
  addStorage() { return { highlighter: createCodeHighlighter() } },
  addProseMirrorPlugins() { this.options.lowlight = this.storage.highlighter; return this.parent?.() || [] },
  onDestroy() { this.storage.highlighter.clear() },
  addNodeView() {
    const { icon, root } = this.options, highlighter = this.storage.highlighter
    return ({ node: initial, editor, view, getPos }) => {
      let node = initial, destroyed = false, timer, copying = false
      const dom = document.createElement('div'), toolbar = document.createElement('div')
      const select = document.createElement('select'), copy = document.createElement('button')
      const languageControl = document.createElement('span'), languageLabel = document.createElement('span'), chevron = document.createElement('span')
      const pre = document.createElement('pre'), code = document.createElement('code'), status = document.createElement('span')
      dom.className = 'fn-code-block'
      toolbar.className = 'fn-code-tools'; toolbar.contentEditable = 'false'
      languageControl.className = 'fn-code-language-control'
      languageLabel.className = 'fn-code-language-label'; languageLabel.setAttribute('aria-hidden', 'true')
      chevron.className = 'fn-code-chevron'; chevron.setAttribute('aria-hidden', 'true'); chevron.textContent = '⌄'
      select.className = 'fn-code-language'; select.setAttribute('aria-label', 'Code language'); select.title = 'Code language'
      for (const [value, label] of codeLanguages) select.add(new Option(label, value))
      copy.type = 'button'; copy.className = 'fn-code-copy'; copy.setAttribute('aria-label', 'Copy code')
      status.className = 'fn-code-status'; status.setAttribute('role', 'status')
      pre.spellcheck = false; code.spellcheck = false
      languageControl.append(languageLabel, chevron, select)
      pre.append(code); toolbar.append(languageControl, status, copy); dom.append(toolbar, pre)
      const copyLabel = label => {
        copy.replaceChildren()
        const glyph = document.createElement('span'); glyph.setAttribute('aria-hidden', 'true')
        const svg = icon?.(label === 'Copied' ? 'check' : 'copy')
        if (svg) glyph.innerHTML = svg
        else glyph.textContent = label === 'Copied' ? '✓' : '⧉'
        copy.append(glyph); copy.title = label === 'Copy' ? 'Copy code' : label
        copy.dataset.state = label === 'Copied' ? 'copied' : label === 'Retry copy' ? 'error' : 'idle'
      }
      let mover, resizer
      if (editor.isEditable) {
        const grips = resizeHandles(dom, 'code block', icon)
        toolbar.classList.add('is-draggable'); toolbar.title = 'Drag code block'
        mover = createMover({ view, dom, handle: toolbar, getPos, isEditable: () => editor.isEditable,
          ignore: target => !!target.closest('button,select,input,a,.fn-code-language-control'),
          preventDefault: true, root, onClick: () => selectObject(view,getPos),
          rebuild: (current, placement) => current.type.create({ ...current.attrs, ...placement, documentFlow: false }, current.content),
          widthFor: () => dom.getBoundingClientRect().width })
        const setSize = (changes, transaction) => {
          const pos = getPos(), tr = transaction || closeHistory(view.state.tr)
          tr.setNodeMarkup(pos, null, { ...tr.doc.nodeAt(pos).attrs, ...changes })
          if (!transaction) view.dispatch(tr)
        }
        resizer = createObjectResizer({ view, dom, handles: grips, getPos, isEditable: () => editor.isEditable,
          begin: () => {
            const rect = dom.getBoundingClientRect()
            return { rect, maximum: Math.max(1,view.dom.getBoundingClientRect().right - rect.left) }
          },
          preview: (data, dx, dy, axis) => {
            data.changes = {}
            if (axis !== 'height' && dx) {
              data.changes.canvasWidth = resizeLength(data.rect.width + dx, 120, data.maximum)
              dom.style.width = data.changes.canvasWidth + 'px'
            }
            if (axis !== 'width' && dy) {
              data.changes.minHeight = resizeLength(data.rect.height + dy, 1)
              dom.style.setProperty('--fn-min-height', data.changes.minHeight + 'px')
            }
          },
          commit: (data, tr) => setSize(data.changes, tr),
        })
        for (const grip of grips) grip.addEventListener('dblclick', () => {
          if (!editor.isEditable) return
          const axis = grip.dataset.resizeAxis, changes = {}
          if (axis !== 'width') changes.minHeight = 0
          if (axis !== 'height') {
            changes.canvasWidth = node.attrs.layout === 'canvas' ? fittedWidth(dom) : 0
          }
          setSize(changes)
        })
      }
      const sync = () => {
        applyPlacement(dom, node.attrs)
        dom.style.width = node.attrs.canvasWidth ? node.attrs.canvasWidth + 'px' : ''
        const language = codeLanguage(node.attrs.language)
        for (const option of [...select.options]) if (option.hasAttribute('data-custom')) option.remove()
        if (![...select.options].some(option => option.value === language)) {
          const option = new Option(codeLanguageLabel(language), language); option.dataset.custom = ''; select.add(option)
        }
        select.value = language; select.disabled = !editor.isEditable
        const detected = language === 'auto' ? highlighter.detect(node.textContent) : language
        languageLabel.textContent = language === 'auto' ? (detected === 'plaintext' ? 'Auto' : `Auto · ${codeLanguageLabel(detected)}`) : codeLanguageLabel(language)
        select.title = language === 'auto' ? (detected === 'plaintext' ? 'Auto-detect language — choose a type if needed' : `Auto-detected ${codeLanguageLabel(detected)} — change language`) : 'Code language: ' + codeLanguageLabel(language)
        languageControl.classList.toggle('is-readonly', !editor.isEditable)
        const className = 'language-' + detected
        if (code.className !== className) code.className = className
      }
      select.addEventListener('change', () => { changeCodeLanguage(editor, getPos(), select.value); sync() })
      copy.addEventListener('mousedown', event => event.preventDefault())
      copy.addEventListener('click', async () => {
        if (copying) return
        copying = true; clearTimeout(timer); status.textContent = ''; copy.title = ''
        try {
          await navigator.clipboard.writeText(node.textContent)
          if (destroyed) return
          copyLabel('Copied'); status.textContent = 'Code copied to clipboard.'
          timer = setTimeout(() => { copyLabel('Copy'); status.textContent = '' }, 2200)
        } catch {
          if (destroyed) return
          copyLabel('Retry copy'); status.textContent = 'Couldn’t copy. Select the code and copy it manually.'
          copy.title = status.textContent
        } finally { copying = false }
      })
      copyLabel('Copy'); sync()
      // NodeView.update handles this block's content and placement. A document
      // update elsewhere only needs to refresh whether its controls are enabled.
      // Running sync here wrote to every code contentDOM after ProseMirror had
      // resumed observing it, so moving an unrelated object lost its selection.
      const syncEditable = () => {
        select.disabled = !editor.isEditable
        languageControl.classList.toggle('is-readonly', !editor.isEditable)
      }
      editor.on('update', syncEditable)
      return {
        dom, contentDOM: code,
        update(next) { if (next.type !== node.type) return false; node = next; sync(); return true },
        stopEvent: event => toolbar.contains(event.target) || !!event.target.closest?.('.fn-object-resize,.fn-resize-edge'),
        ignoreMutation: mutation => ignoreCodeMutation(code, mutation),
        destroy() { destroyed = true; clearTimeout(timer); mover?.destroy(); resizer?.destroy(); editor.off('update', syncEditable) },
      }
    }
  },
})
