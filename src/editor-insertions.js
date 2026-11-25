import { TextSelection } from '@tiptap/pm/state'

// Split at the actual caret. A highlighted range is preserved after the divider.
export const insertDivider = chain => chain.command(({ tr }) => {
  if (tr.selection instanceof TextSelection && !tr.selection.empty) tr.setSelection(TextSelection.create(tr.doc, tr.selection.from))
  return true
}).setHorizontalRule().command(({ tr }) => {
  if (tr.selection.node) tr.setSelection(TextSelection.near(tr.doc.resolve(tr.selection.from), 1))
  return true
})
