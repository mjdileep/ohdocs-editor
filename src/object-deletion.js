import { Extension } from '@tiptap/core'
import { Plugin, TextSelection } from '@tiptap/pm/state'

const object = node => node && ['previewAttachment', 'table', 'codeBlock'].includes(node.type.name)

// Floating blocks keep document positions independent of their visible position.
// At a text boundary, delete toward the next text block without consuming those
// objects. Explicit node/range selections retain ordinary deletion behavior.
export function deleteAcrossObjects(state, dispatch, direction) {
  const { selection, doc } = state
  if (!(selection instanceof TextSelection) || !selection.empty) return false
  const cursor = selection.$from
  if (!cursor.parent.isTextblock) return false
  if (cursor.parentOffset !== (direction < 0 ? 0 : cursor.parent.content.size)) return false
  // At a nested boundary, prevent the fallback from implicitly selecting an
  // outside object (the next Backspace would then delete it). Cell/list edits
  // otherwise keep their native commands.
  if (cursor.depth !== 1) {
    for (let depth = cursor.depth; depth > 0; depth--) {
      const cut = doc.resolve(direction < 0 ? cursor.before(depth) : cursor.after(depth))
      if (object(direction < 0 ? cut.nodeBefore : cut.nodeAfter)) return true
      if (cursor.node(depth).type.spec.isolating) break
      const index = cursor.index(depth - 1)
      if (index !== (direction < 0 ? 0 : cursor.node(depth - 1).childCount - 1)) break
    }
    return false
  }
  const index = cursor.index(0), currentStart = cursor.before(), current = cursor.parent
  let neighborIndex = index + direction, skipped = false
  while (neighborIndex >= 0 && neighborIndex < doc.childCount && object(doc.child(neighborIndex))) {
    skipped = true
    neighborIndex += direction
  }
  if (!skipped) return false
  if (object(current)) return true
  if (neighborIndex < 0 || neighborIndex >= doc.childCount) return true
  const neighbor = doc.child(neighborIndex)
  if (!neighbor.isTextblock) return true
  let neighborStart = 0
  for (let i = 0; i < neighborIndex; i++) neighborStart += doc.child(i).nodeSize
  const tr = state.tr
  const before = direction < 0 ? neighbor : current
  const after = direction < 0 ? current : neighbor
  const beforeStart = direction < 0 ? neighborStart : currentStart
  const afterStart = direction < 0 ? currentStart : neighborStart
  const caret = beforeStart + 1 + before.content.size
  if (before.type.validContent(before.content.append(after.content))) {
    tr.insert(caret, after.content)
    tr.delete(tr.mapping.map(afterStart), tr.mapping.map(afterStart + after.nodeSize))
    tr.setSelection(TextSelection.create(tr.doc, caret))
  } else {
    tr.setSelection(TextSelection.create(doc, direction < 0 ? neighborStart + neighbor.nodeSize - 1 : neighborStart + 1))
  }
  dispatch?.(tr.scrollIntoView())
  return true
}

export const ObjectDeletion = Extension.create({
  name: 'objectDeletion',
  priority: 1100,
  addProseMirrorPlugins() {
    const remove = (view, direction) => view.editable && deleteAcrossObjects(view.state, tr => view.dispatch(tr), direction)
    return [new Plugin({ props: {
      handleKeyDown(view, event) {
        if (event.isComposing) return false
        if (event.key === 'Backspace') return remove(view, -1)
        if (event.key === 'Delete') return remove(view, 1)
        return false
      },
      handleDOMEvents: { beforeinput(view, event) {
        const direction = { deleteContentBackward: -1, deleteWordBackward: -1, deleteContentForward: 1, deleteWordForward: 1 }[event.inputType]
        if (!direction || !remove(view, direction)) return false
        event.preventDefault()
        return true
      } },
    } })]
  },
})
