// Menu actions use the same serializer and paste pipeline as the keyboard,
// including ProseMirror slice metadata and the editor's size/attachment rules.
export async function copyEditorSelection(view, clipboard = navigator.clipboard) {
  const { dom, text } = view.serializeForClipboard(view.state.selection.content())
  if (!clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Rich clipboard unavailable')
  await clipboard.write([new ClipboardItem({
    'text/html': new Blob([dom.innerHTML], { type: 'text/html' }),
    'text/plain': new Blob([text], { type: 'text/plain' }),
  })])
}

export async function pasteEditorSelection(view, isCurrent = () => true, clipboard = navigator.clipboard) {
  const { doc, selection } = view.state
  const current = () => !view.isDestroyed && isCurrent() && view.state.doc === doc && view.state.selection.eq(selection)
  if (!clipboard?.read) throw new Error('Rich clipboard unavailable')
  const items = await clipboard.read()
  let html = '', text = ''
  for (const item of items) {
    if (item.types.includes('text/html')) html ||= await (await item.getType('text/html')).text()
    if (item.types.includes('text/plain')) text ||= await (await item.getType('text/plain')).text()
  }
  if (!current()) return false
  // Images on the OS clipboard need the native paste event's file pipeline.
  if (!html && !text) throw new Error('Use keyboard paste for files')
  view.focus()
  return html ? view.pasteHTML(html) : view.pasteText(text)
}
