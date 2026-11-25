import { Mark, mergeAttributes } from '@tiptap/core'
import Highlight from '@tiptap/extension-highlight'
import { closeHistory } from '@tiptap/pm/history'
import { textColor, textSize, textStyleAttributes } from '../format/text-formatting.mjs'

function inheritedStyle(element) {
  const attrs = {}
  for (let el = element; el?.style; el = el.parentElement) {
    if (!attrs.color) attrs.color = textColor(el.style.color)
    if (!attrs.fontSize) attrs.fontSize = textSize(el.style.fontSize)
    if (attrs.color && attrs.fontSize) break
  }
  return textStyleAttributes(attrs)
}

export const TextStyle = Mark.create({
  name: 'textStyle',
  addAttributes() {
    return {
      color: { default: null, parseHTML: el => inheritedStyle(el).color || null, renderHTML: attrs => textColor(attrs.color) ? { style: `color: ${textColor(attrs.color)}` } : {} },
      fontSize: { default: null, parseHTML: el => inheritedStyle(el).fontSize || null, renderHTML: attrs => textSize(attrs.fontSize) ? { style: `font-size: ${textSize(attrs.fontSize)}` } : {} },
    }
  },
  parseHTML() {
    // Style rules also preserve formatting pasted on paragraphs, links, etc.
    return [{ tag: '[style]', consuming: false, getAttrs: el => {
      const attrs = textStyleAttributes({ color: el.style.color, fontSize: el.style.fontSize })
      return Object.keys(attrs).length ? inheritedStyle(el) : false
    } }]
  },
  renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes), 0] },
})

export const TextHighlight = Highlight.extend({
  addAttributes() {
    return { color: {
      default: null,
      parseHTML: el => textColor(el.getAttribute('data-color')) || textColor(el.style.backgroundColor),
      renderHTML: attrs => textColor(attrs.color) ? { 'data-color': textColor(attrs.color), style: `background-color: ${textColor(attrs.color)}; color: inherit` } : {},
    } }
  },
  parseHTML() {
    return [ { tag: 'mark' }, { tag: '[style]', consuming: false, getAttrs: el => {
      // A table's fill belongs to its cells, not to a highlight on every word.
      if (/^(TABLE|THEAD|TBODY|TFOOT|TR|TD|TH|COL|COLGROUP)$/.test(el.tagName)) return false
      const color = textColor(el.style.backgroundColor)
      return color ? { color } : false
    } } ]
  },
}).configure({ multicolor: true })

const markName = attribute => attribute === 'backgroundColor' ? 'highlight' : 'textStyle'
const markAttribute = attribute => attribute === 'backgroundColor' ? 'color' : attribute

// Preserve each text run's other attributes when a selection spans mixed styles.
// Cell selections use their individual ranges, leaving unselected cells alone.
export function textFormattingTransaction(state, attribute, value) {
  if (!['color', 'backgroundColor', 'fontSize'].includes(attribute) || state.selection.node) return null
  const normalized = value === null ? null : attribute === 'fontSize' ? textSize(value) : textColor(value)
  if (value !== null && !normalized) return null
  const type = state.schema.marks[markName(attribute)], key = markAttribute(attribute)
  if (!type) return null
  const tr = closeHistory(state.tr)
  const nextMark = marks => {
    const previous = type.isInSet(marks), attrs = { ...previous?.attrs, [key]: normalized }
    if (attribute === 'backgroundColor') return normalized ? type.create({ color: normalized }) : null
    const clean = textStyleAttributes(attrs)
    return Object.keys(clean).length ? type.create(clean) : null
  }
  const allowed = (marks, parent) => parent.type.allowsMarkType(type) && !marks.some(mark => mark.type !== type && mark.type.excludes(type))
  if (state.selection.empty) {
    const marks = state.storedMarks || state.selection.$from.marks()
    if (!allowed(marks, state.selection.$from.parent)) return null
    const mark = nextMark(marks)
    tr.removeStoredMark(type)
    if (mark) tr.addStoredMark(mark)
  } else {
    for (const { $from, $to } of state.selection.ranges) state.doc.nodesBetween($from.pos, $to.pos, (node, pos, parent) => {
      if (!node.isText || !allowed(node.marks, parent)) return
      const from = Math.max(pos, $from.pos), to = Math.min(pos + node.nodeSize, $to.pos), mark = nextMark(node.marks)
      tr.removeMark(from, to, type)
      if (mark) tr.addMark(from, to, mark)
    })
  }
  return tr
}

export function applyTextFormatting(editor, attribute, value) {
  if (!editor?.isEditable || editor.isDestroyed) return false
  const tr = textFormattingTransaction(editor.state, attribute, value)
  if (!tr) return false
  editor.view.dispatch(tr)
  editor.view.dispatch(closeHistory(editor.state.tr))
  editor.commands.focus(undefined, { scrollIntoView: false })
  return true
}

export function selectedTextFormatting(state) {
  const values = { color: new Set(), backgroundColor: new Set(), fontSize: new Set() }
  const read = marks => {
    const style = marks.find(mark => mark.type.name === 'textStyle')?.attrs || {}, highlight = marks.find(mark => mark.type.name === 'highlight')
    values.color.add(textColor(style.color))
    values.fontSize.add(textSize(style.fontSize))
    values.backgroundColor.add(highlight ? textColor(highlight.attrs.color) || '#ffe680' : null)
  }
  if (state.selection.empty) read(state.storedMarks || state.selection.$from.marks())
  else for (const { $from, $to } of state.selection.ranges) state.doc.nodesBetween($from.pos, $to.pos, node => { if (node.isText) read(node.marks) })
  return Object.fromEntries(Object.entries(values).map(([key, set]) => [key, set.size > 1 ? 'mixed' : [...set][0] || null]))
}
