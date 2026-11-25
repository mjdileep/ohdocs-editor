import test from 'node:test'
import assert from 'node:assert/strict'
import { FORMAT_VERSION, nodeTypes, validDoc, documentFormat, isNewerFormat, migrateDocument, displayableDocument } from './schema.mjs'

const doc = (content, attrs) => ({ type: 'doc', ...(attrs ? { attrs } : {}), content })
const paragraph = (...content) => ({ type: 'paragraph', content })
const text = (value, marks) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) })

test('documents may contain only the node types the editor saves, within size limits', () => {
  assert.equal(validDoc(doc([paragraph(text('Hello'))])), true)
  assert.equal(validDoc(doc([{ type: 'script', content: [] }])), false)
  assert.equal(validDoc(doc([paragraph(text('x'.repeat(200001)))])), false)
  let deep = paragraph(text('deep'))
  for (let i = 0; i < 40; i++) deep = { type: 'blockquote', content: [deep] }
  assert.equal(validDoc(doc([deep])), false)
  assert.ok(nodeTypes.has('previewAttachment') && nodeTypes.has('footnoteDefinition'))
})

test('format 1 documents carry no marker and later formats are read from doc.attrs.format', () => {
  assert.equal(migrateDocument(doc([])).attrs.format, FORMAT_VERSION)
  assert.equal(documentFormat(doc([])), 1)
  assert.equal(documentFormat(undefined), 1)
  assert.equal(documentFormat(doc([], { format: 3 })), 3)
  assert.equal(documentFormat(doc([], { format: 'x' })), 1)
  assert.equal(isNewerFormat(doc([])), false)
  assert.equal(isNewerFormat(doc([], { format: FORMAT_VERSION + 1 })), true)
})

test('current documents need no migration and are returned unchanged', () => {
  const current = doc([paragraph(text('Same'))], { format: FORMAT_VERSION })
  assert.equal(migrateDocument(current), current)
})

test('a newer document becomes displayable: unknown blocks, inline nodes and marks are replaced, known content kept', () => {
  const newer = doc([
    paragraph(text('Kept', [{ type: 'bold' }, { type: 'sparkle' }]), { type: 'mention', attrs: { id: 'x' } }),
    { type: 'kanbanBoard', content: [paragraph(text('hidden'))] },
    { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'chart' }] }] }] },
  ], { format: FORMAT_VERSION + 1 })
  const shown = displayableDocument(newer)
  assert.deepEqual(shown.content[0].content, [text('Kept', [{ type: 'bold' }]), text('[…]')])
  assert.equal(shown.content[1].type, 'paragraph')
  assert.match(shown.content[1].content[0].text, /newer version/)
  assert.equal(shown.content[2].content[0].content[0].content[0].type, 'paragraph')
  assert.equal(validDoc(shown), true)
  assert.equal(newer.content[1].type, 'kanbanBoard', 'the original is not modified')
})
