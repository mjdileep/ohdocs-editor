import { Extension, InputRule, Mark, Node, mergeAttributes, wrappingInputRule } from '@tiptap/core'
import { Markdown } from '@tiptap/markdown'
import { InlineMath, BlockMath } from '@tiptap/extension-mathematics'
import { Plugin } from '@tiptap/pm/state'
import { DOMParser as SchemaParser, Mark as SchemaMark, Slice, Fragment } from '@tiptap/pm/model'
import { closeHistory } from '@tiptap/pm/history'
import katex from 'katex'
import { Marked, Tokenizer } from 'marked'
import { footnoteLabel, footnoteID, markdownURL, renderMath } from '../format/markdown.mjs'
import { videoSource } from '../format/video.mjs'
import { textColor, textSize } from '../format/text-formatting.mjs'

export const markdownImage = {
  markdownTokenName: 'image',
  parseMarkdown(token) {
    const source = markdownURL(token.href, true)
    return source ? { type: 'previewAttachment', attrs: { source, label: token.text || 'Image', detail: token.title || '' } } : { type: 'text', text: token.raw || token.text || 'Image' }
  },
  renderMarkdown(node) { if(videoSource(node.attrs.videoSource))return videoSource(node.attrs.videoSource).url; return node.attrs.source ? `![${String(node.attrs.label).replace(/[\\[\]]/g, '\\$&')}](${node.attrs.source.replace(/[()]/g, c => c === '(' ? '%28' : '%29')})` : node.attrs.label },
}

export const markdownLimit = 200000

// Parse raw HTML in an inert template first. Only editor formatting survives;
// scripts, network attributes, event handlers and arbitrary CSS never reach a
// live document. Matching a whole element also keeps nested inline styles.
function htmlToken(src, block) {
  const opening = src.match(/^<(\/?)([a-z][\w-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/i)
  if (!opening) return undefined
  const tag = opening[2].toLowerCase(), blocks = /^(?:p|div|section|h[1-6]|blockquote|pre|ul|ol|li|table|details|hr)$/
  if (block && !blocks.test(tag)) return undefined
  let end = opening[0].length
  if (!opening[1] && !/^(?:br|hr|img|input|meta|link|source|wbr)$/.test(tag) && !opening[0].endsWith('/>')) {
    const tags = new RegExp(`<(/?)${tag}\\b(?:[^>"']|"[^"]*"|'[^']*')*>`, 'gi')
    tags.lastIndex = end; let depth = 1, match
    while ((match = tags.exec(src))) { depth += match[1] ? -1 : 1; if (!depth) { end = tags.lastIndex; break } }
    if (depth) return undefined
  }
  return { type: block ? 'safeBlockHTML' : 'safeInlineHTML', raw: src.slice(0, end), block }
}
function parseSafeHTML(token) {
  if (typeof document === 'undefined') return token.block ? {type:'paragraph',content:[{type:'text',text:token.raw}]} : {type:'text',text:token.raw}
  const template = document.createElement('template'); template.innerHTML = token.raw
  const allowed = /^(?:P|DIV|SECTION|SPAN|MARK|U|SUP|SUB|A|STRONG|B|EM|I|S|DEL|STRIKE|CODE|PRE|H[1-6]|BLOCKQUOTE|UL|OL|LI|TABLE|THEAD|TBODY|TFOOT|TR|TH|TD|BR|HR|DETAILS|SUMMARY)$/
  for (const el of [...template.content.querySelectorAll('*')]) {
    if (el.tagName === 'IMG') {
      const source = markdownURL(el.getAttribute('src'), true), replacement = document.createElement('div')
      replacement.dataset.filename = el.getAttribute('alt') || 'Image'
      if (source) replacement.dataset.imageSource = source
      else replacement.textContent = el.getAttribute('alt') || 'Image'
      el.replaceWith(replacement); continue
    }
    if (!allowed.test(el.tagName)) { el.replaceWith(document.createTextNode(el.outerHTML)); continue }
    const styles = { color: textColor(el.style.color), 'background-color': textColor(el.style.backgroundColor), 'font-size': textSize(el.style.fontSize), 'text-align': ['left','center','right'].includes(el.style.textAlign) ? el.style.textAlign : null }
    for (const attr of [...el.attributes]) {
      const keep = ['colspan','rowspan','start','open','data-type','data-checked','data-footnote-ref','data-footnote-definition','data-latex'].includes(attr.name)
      if (!keep && attr.name !== 'href') el.removeAttribute(attr.name)
    }
    if (el.hasAttribute('href')) { const href = markdownURL(el.getAttribute('href')); if (href) el.setAttribute('href', href); else el.removeAttribute('href') }
    for (const [name,value] of Object.entries(styles)) if (value) el.style.setProperty(name,value)
  }
  const doc = SchemaParser.fromSchema(this.options.getSchema()).parse(template.content).toJSON()
  if (token.block) return doc.content
  return doc.content.flatMap(node => node.type === 'paragraph' ? node.content || [] : [node])
}
function safeHTML(block) {
  const name = block ? 'safeBlockHTML' : 'safeInlineHTML'
  return Extension.create({ name, priority: 1100,
    addOptions: () => ({ getSchema: null }),
    markdownTokenizer: { name, level: block ? 'block' : 'inline', start: src => src.search(/<[a-z]/i), tokenize: src => htmlToken(src, block) },
    parseMarkdown: parseSafeHTML,
  })
}
export const SafeBlockHTML = safeHTML(true), SafeInlineHTML = safeHTML(false)
export const LiteralHTML = Extension.create({ name: 'literalHTML', parseMarkdown: token => token.block ? { type:'paragraph', content:[{ type:'text', text:token.raw }] } : { type:'text', text:token.raw } })
const inlineMathPattern = /^\$(?![\s$])((?:\\[^\n]|[^$\\\n])+)\$(?![\d$])/
function mathToken(src) {
  if (/^\$\d+(?:,\d{3})*(?:\.\d+)?(?=[.,!?;:](?:\s|$)|\s+(?:[A-Za-z]{2,}|\$)|$)/.test(src)) return undefined
  const match = src.match(inlineMathPattern)
  return match && !/\s$/.test(match[1]) ? { type: 'inlineMath', raw: match[0], latex: match[1] } : undefined
}
function mathView({ node, getPos, editor }) {
  const block = node.type.name === 'blockMath', dom = document.createElement(block ? 'div' : 'span')
  dom.contentEditable = 'false'; dom.className = 'fn-math'; dom.dataset.type = block ? 'block-math' : 'inline-math'
  dom.dataset.latex = node.attrs.latex
  dom.innerHTML = renderMath(katex, node.attrs.latex, block)
  if (editor.isEditable) {
    dom.tabIndex = 0; dom.setAttribute('role', 'button'); dom.setAttribute('aria-label', 'Edit equation: ' + node.attrs.latex)
    const edit = () => { const pos = getPos(); if (typeof pos === 'number') this.options.onClick?.(node, pos) }
    dom.addEventListener('click', edit)
    dom.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); edit() } })
  }
  return { dom, stopEvent: event => event.type === 'click' || event.type === 'keydown', ignoreMutation: () => true }
}
export const NoteInlineMath = InlineMath.extend({
  markdownTokenizer: { name: 'inlineMath', level: 'inline', start: src => src.indexOf('$'), tokenize: mathToken },
  addInputRules() {
    return [new InputRule({ find: text => {
      for (let i = 0; i < text.length; i++) if (text[i] === '$' && text[i - 1] !== '\\' && text[i - 1] !== '$') {
        const token = mathToken(text.slice(i))
        if (token && i + token.raw.length === text.length) return { index: i, text: token.raw, data: token }
      }
      return null
    }, handler: ({ state, range, match }) => state.tr.replaceWith(range.from, range.to, this.type.create({ latex: match.data.latex })) })]
  },
  renderText: ({ node }) => `$${node.attrs.latex}$`,
  renderHTML: ({ node, HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'inline-math' }), `$${node.attrs.latex}$`],
  addNodeView() { return mathView.bind(this) },
})
export const NoteBlockMath = BlockMath.extend({
  addInputRules() {
    return [new InputRule({ find: /^\$\$([^\n]+?)\$\$$/, handler: ({ state, range, match }) => {
      const $from = state.doc.resolve(range.from)
      if ($from.parent.type.name !== 'paragraph' || range.from !== $from.start()) return null
      state.tr.replaceWith($from.before(), $from.after(), this.type.create({ latex: match[1] }))
    } })]
  },
  renderText: ({ node }) => `$$\n${node.attrs.latex}\n$$`,
  renderHTML: ({ node, HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'block-math' }), `$$\n${node.attrs.latex}\n$$`],
  addNodeView() { return mathView.bind(this) },
})

export const FootnoteReference = Node.create({
  name: 'footnoteReference', group: 'inline', inline: true, atom: true,
  addAttributes() { return { label: { default: 'note', parseHTML: el => footnoteLabel(el.dataset.footnoteRef), renderHTML: attrs => ({ 'data-footnote-ref': footnoteLabel(attrs.label) }) } } },
  parseHTML: () => [{ tag: 'sup[data-footnote-ref]' }],
  renderHTML: ({ node, HTMLAttributes }) => ['sup', HTMLAttributes, ['a', { href: '#' + footnoteID(node.attrs.label), 'aria-label': 'Footnote ' + node.attrs.label }, '[' + node.attrs.label + ']']],
  renderText: ({ node }) => `[^${node.attrs.label}]`,
  markdownTokenizer: { name: 'footnoteReference', level: 'inline', start: src => src.indexOf('[^'), tokenize(src) {
    const m = src.match(/^\[\^([^\]\s]+)\]/)
    return m ? { type: 'footnoteReference', raw: m[0], label: footnoteLabel(m[1]) } : undefined
  } },
  parseMarkdown: token => ({ type: 'footnoteReference', attrs: { label: token.label } }),
  renderMarkdown: node => `[^${node.attrs.label}]`,
  addInputRules() { return [new InputRule({ find: /\[\^([^\]\s]+)\]$/, handler: ({ state, range, match }) => {
    // At the beginning of a paragraph this may become a definition (": ").
    if (range.from === state.selection.$from.start()) return null
    state.tr.replaceWith(range.from, range.to, this.type.create({ label: footnoteLabel(match[1]) }))
  } })] },
  addProseMirrorPlugins() { return [new Plugin({ props: { handleClick(view, _pos, event) {
    const ref = event.target.closest?.('[data-footnote-ref]')
    if (!ref) return false
    const target = [...view.dom.querySelectorAll('[data-footnote-definition]')].find(el => el.dataset.footnoteDefinition === ref.dataset.footnoteRef)
    if (!target) return false
    event.preventDefault(); target.scrollIntoView({ block: 'center', behavior: 'auto' }); return true
  } } })] },
})
export const FootnoteDefinition = Node.create({
  name: 'footnoteDefinition', group: 'block', content: 'block+', defining: true,
  addAttributes() { return { label: { default: 'note', parseHTML: el => footnoteLabel(el.dataset.footnoteDefinition), renderHTML: attrs => ({ 'data-footnote-definition': footnoteLabel(attrs.label), id: footnoteID(attrs.label) }) } } },
  parseHTML: () => [{ tag: 'section[data-footnote-definition]' }],
  renderHTML: ({ HTMLAttributes }) => ['section', mergeAttributes(HTMLAttributes, { class: 'fn-footnote' }), 0],
  addInputRules() { return [wrappingInputRule({ find: /^\[\^([^\]\s]+)\]:\s$/, type: this.type, getAttributes: match => ({label:footnoteLabel(match[1])}) })] },
  markdownTokenizer: { name: 'footnoteDefinition', level: 'block', start: src => src.search(/^ {0,3}\[\^[^\]\s]+\]:/m), tokenize(src, _tokens, lexer) {
    const m = src.match(/^ {0,3}\[\^([^\]\s]+)\]:[ \t]*([^\n]*)(?:\n|$)/)
    if (!m) return undefined
    let raw = m[0], body = m[2], rest = src.slice(raw.length)
    while (rest) {
      const continuation = rest.match(/^(?:\n(?=(?: {4}|\t)))?(?: {4}|\t)([^\n]*)(?:\n|$)/)
      if (!continuation) break
      body += (continuation[0].startsWith('\n') ? '\n\n' : '\n') + continuation[1]
      raw += continuation[0]; rest = rest.slice(continuation[0].length)
    }
    return { type: 'footnoteDefinition', raw, label: footnoteLabel(m[1]), tokens: lexer.blockTokens(body) }
  } },
  parseMarkdown: (token, helpers) => ({ type: 'footnoteDefinition', attrs: { label: token.label }, content: helpers.parseChildren(token.tokens).length ? helpers.parseChildren(token.tokens) : [{ type: 'paragraph' }] }),
  renderMarkdown: (node, helpers) => `[^${node.attrs.label}]: ${helpers.renderChildren(node.content, '\n\n').replace(/\n/g, '\n    ')}`,
})
export const Superscript = Mark.create({ name: 'superscript', parseHTML: () => [{ tag: 'sup:not([data-footnote-ref])' }], renderHTML: () => ['sup', 0], renderMarkdown: (_node, helpers) => `<sup>${helpers.renderChildren(_node)}</sup>` })
export const Subscript = Mark.create({ name: 'subscript', parseHTML: () => [{ tag: 'sub' }], renderHTML: () => ['sub', 0], renderMarkdown: (_node, helpers) => `<sub>${helpers.renderChildren(_node)}</sub>` })

// Use the editor's schema for HTML inside Markdown, so colors/sizes and existing
// rich content share their normal parsers. Discard active HTML before it can load.
export function parseMarkdown(editor, source) {
  if (typeof source !== 'string' || source.length > markdownLimit) throw new Error('Choose Markdown under 200,000 characters.')
  const doc = editor.markdown.parse(source.replace(/\r\n?/g, '\n'))
  // Markdown images can occur between words; the canvas uses block objects.
  // Split their surrounding paragraph instead of dropping or nesting an image.
  function blocks(node) {
    if (node.content) node.content = node.content.flatMap(blocks)
    if (['listItem','taskItem'].includes(node.type) && node.content?.[0]?.type !== 'paragraph') node.content.unshift({type:'paragraph'})
    if (!editor.schema.nodes[node.type]?.isTextblock || !node.content?.some(child => !editor.schema.nodes[child.type]?.isInline)) return [node]
    const parts = []; let inline = []
    const flush = () => { if (inline.length) parts.push({ ...node, content: inline }); inline = [] }
    for (const child of node.content) { if (editor.schema.nodes[child.type]?.isInline) inline.push(child); else { flush(); parts.push(child) } }
    flush(); return parts
  }
  blocks(doc)
  let count = 0
  function clean(node, depth = 0) {
    if (++count > 20000 || depth > 30) throw new Error('This Markdown is too complex. Insert a smaller section.')
    if (['table','previewAttachment'].includes(node.type) && editor.schema.nodes[node.type]?.spec.attrs?.documentFlow) node.attrs = { ...node.attrs, documentFlow: true }
    if (node.marks) {
      // Markdown can nest marks the editor treats as exclusive, such as bold
      // around inline code. Apply the schema's normal mark rules before validation.
      let marks = SchemaMark.none
      for (const mark of node.marks) {
        let safeMark = mark
        if (mark.type === 'link') {
          const href = markdownURL(mark.attrs?.href)
          if (!href) continue
          safeMark = { ...mark, attrs: { ...mark.attrs, href } }
        }
        marks = editor.schema.markFromJSON(safeMark).addToSet(marks)
      }
      if (marks.length) node.marks = marks.map(mark => mark.toJSON())
      else delete node.marks
    }
    node.content?.forEach(child => clean(child, depth + 1))
  }
  clean(doc)
  if (!doc.content.length) doc.content.push({type:'paragraph'})
  const existing = new Set(), incoming = new Set(), rename = new Map()
  editor.state.doc.descendants(node => { if (node.type.name === 'footnoteDefinition') existing.add(node.attrs.label) })
  const visit = (node, fn) => { fn(node); node.content?.forEach(child => visit(child, fn)) }
  visit(doc, node => { if (node.type === 'footnoteDefinition') incoming.add(node.attrs.label) })
  for (const label of incoming) if (existing.has(label)) { let i = 2, next; do { next = label + '-' + i++ } while (existing.has(next) || incoming.has(next)); rename.set(label,next); existing.add(next) }
  visit(doc, node => { if (['footnoteReference','footnoteDefinition'].includes(node.type) && rename.has(node.attrs.label)) node.attrs.label = rename.get(node.attrs.label) })
  editor.schema.nodeFromJSON(doc).check()
  return doc
}
export function looksLikeMarkdown(text) {
  return /(?:^|\n) {0,3}(?:#{1,6}\s|>\s|(?:[-+*]|\d+[.)])\s|`{3}|~{3}|\[\^[^\]]+\]:|(?:[-*_]\s*){3,}$|\$\$)|(?:^|\n).+\n {0,3}(?:={2,}|-{2,})\s*(?:\n|$)|\|[^\n]+\|\s*\n\s*\|?\s*:?-{3}|(?:\*\*|__|~~|==)\S[^\n]*?\S?(?:\*\*|__|~~|==)|(?:^|\s)[*_]\S[^\n]*?[*_](?=\s|[.,!?]|$)|`[^`\n]+`|!?\[[^\]\n]+\]\([^\n]+\)|\[\^[^\]\s]+\]|\$(?![\s$])[^$\n]+\$(?![\d$])/.test(text)
}
export function insertMarkdown(editor, source, range = editor.state.selection) {
  if (!editor?.isEditable || editor.isDestroyed) return false
  if (!source.trim()) return false
  const doc = parseMarkdown(editor, source)
  if (!doc.content?.length) return false
  editor.view.dispatch(closeHistory(editor.state.tr))
  const ok = editor.chain().focus().insertContentAt({ from: range.from, to: range.to }, doc.content).run()
  editor.view.dispatch(closeHistory(editor.state.tr))
  return ok
}
export const MarkdownPaste = Extension.create({
  name: 'markdownPaste',
  addProseMirrorPlugins() { const editor = this.editor; return [new Plugin({ props: {
    clipboardTextParser(text, $context, plain) {
      if(!plain&&editor.isEditable&&$context.parent.type.name==='paragraph'&&!$context.parent.content.size){
        const source=videoSource(text)
        if(source)return new Slice(Fragment.from(editor.schema.nodes.previewAttachment.create({videoSource:source.url,label:'Video',width:source.ratio==='portrait'?270:480})),0,0)
      }
      if (plain || !editor.isEditable || $context.parent.type.spec.code || !looksLikeMarkdown(text) || text.length > markdownLimit) return null
      try { return Slice.maxOpen(editor.schema.nodeFromJSON(parseMarkdown(editor, text)).content) } catch { return null }
    },
  } })] },
})
export const NoteMarkdown = Markdown.extend({
  onBeforeCreate() {
    // Isolate tokenizers between notes and treat unmatched raw HTML literally.
    this.options.marked = new Marked({ gfm: true, breaks: false, tokenizer: {
      html(src) { const token = Tokenizer.prototype.html.call(this, src); return token ? { ...token, type: 'literalHTML', block: true } : false },
      tag(src) { const token = Tokenizer.prototype.tag.call(this, src); return token ? { ...token, type: 'literalHTML', block: false } : false },
    } })
    this.parent?.()
  },
}).configure({ indentation: { style: 'space', size: 2 } })
