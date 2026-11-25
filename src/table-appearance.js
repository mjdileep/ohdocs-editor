import { Extension } from '@tiptap/core'
import { findTable, selectedRect, TableMap } from '@tiptap/pm/tables'
import { closeHistory } from '@tiptap/pm/history'
import { textColor } from '../format/text-formatting.mjs'

export const TableAppearance = Extension.create({
  name: 'tableAppearance',
  addGlobalAttributes() {
    return [{ types: ['tableCell', 'tableHeader'], attributes: { backgroundColor: {
      default: null,
      parseHTML: el => textColor(el.style.backgroundColor) || textColor(el.getAttribute('bgcolor')) || textColor(el.parentElement?.style.backgroundColor),
      renderHTML: attrs => textColor(attrs.backgroundColor) ? { style: `background-color: ${textColor(attrs.backgroundColor)}` } : {},
    } } }]
  },
})

export function backgroundCells(state, scope = 'cell') {
  if (!['cell', 'row', 'column', 'table'].includes(scope)) return []
  const { selection } = state
  let rect
  if (selection.node?.type.spec.tableRole === 'table') {
    const table = selection.node, map = TableMap.get(table)
    rect = { table, map, tableStart: selection.from + 1, left: 0, top: 0, right: map.width, bottom: map.height }
  } else {
    const table = findTable(selection.$from)
    if (!table || findTable(selection.$to)?.pos !== table.pos) return []
    rect = selectedRect(state)
  }
  const { table, map, tableStart } = rect
  const { left, right, top, bottom } = scope === 'table' ? { left: 0, right: map.width, top: 0, bottom: map.height }
    : scope === 'row' ? { ...rect, left: 0, right: map.width }
    : scope === 'column' ? { ...rect, top: 0, bottom: map.height } : rect
  // Include merged cells intersecting the chosen row/column, once each.
  const offsets = new Set()
  for (let row = top; row < bottom; row++) for (let col = left; col < right; col++) offsets.add(map.map[row * map.width + col])
  return [...offsets].map(offset => ({ node: table.nodeAt(offset), pos: tableStart + offset }))
}

export function selectedCellBackground(state, scope) {
  const colors = new Set(backgroundCells(state, scope).map(({ node }) => textColor(node.attrs.backgroundColor)))
  return colors.size > 1 ? 'mixed' : [...colors][0] || null
}

export function cellBackgroundTransaction(state, scope, value) {
  const color = value === null ? null : textColor(value), cells = backgroundCells(state, scope)
  if (!cells.length || (value !== null && !color)) return null
  const tr = closeHistory(state.tr)
  for (const { node, pos } of cells) if (node.attrs.backgroundColor !== color) tr.setNodeMarkup(pos, null, { ...node.attrs, backgroundColor: color })
  return tr
}

export function applyCellBackground(editor, scope, value) {
  if (!editor?.isEditable || editor.isDestroyed) return false
  const tr = cellBackgroundTransaction(editor.state, scope, value)
  if (!tr) return false
  editor.view.dispatch(tr)
  editor.view.dispatch(closeHistory(editor.state.tr))
  editor.commands.focus(undefined, { scrollIntoView: false })
  return true
}
