import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getSchema } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { FORMAT_VERSION, documentFormat, isNewerFormat, migrateDocument } from '../format/schema.mjs'
import { DocumentFormat, documentFormatExtension } from './document-format.js'

const doc = attrs => ({ type: 'doc', ...(attrs ? { attrs } : {}), content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] })
// What the editor saves: load the JSON into the editor's schema and write it back out.
const saved = (format, json) => getSchema([StarterKit, format]).nodeFromJSON(json).toJSON()

test('the editor registers the format attribute, so raising FORMAT_VERSION stamps every saved document', () => {
  const source = readFileSync(new URL('./editor.js', import.meta.url), 'utf8')
  const notebook = source.slice(source.indexOf('export function createNotebook'), source.indexOf('editorProps', source.indexOf('export function createNotebook')))
  assert.match(notebook, /\n\s+DocumentFormat,\n/)
})

test('documents save in the current format: no marker for format 1, the version itself from format 2 on', () => {
  const json = saved(DocumentFormat, doc())
  if (FORMAT_VERSION === 1) assert.equal('attrs' in json, false, 'format 1 documents keep exactly their old JSON')
  else assert.equal(json.attrs.format, FORMAT_VERSION)
  assert.equal(documentFormat(json), FORMAT_VERSION)
})

test('from format 2, the editor keeps a document\'s format and stamps unmarked documents', () => {
  const format2 = documentFormatExtension(2)
  assert.equal(saved(format2, doc()).attrs.format, 2)
  assert.equal(saved(format2, doc({ format: 2 })).attrs.format, 2)
  // A newer document keeps its own marker (it is only ever shown read-only).
  assert.equal(saved(format2, doc({ format: 3 })).attrs.format, 3)
  // Without the extension the marker is silently dropped, which is the bug this prevents.
  assert.equal('attrs' in saved(documentFormatExtension(1), doc({ format: 2 })), false)
})

test('migrating to format 2 records the format, leaves the original alone and fails without a step', () => {
  const original = doc()
  const upgraded = migrateDocument(original, { to: 2, steps: { 1: d => d } })
  assert.equal(upgraded.attrs.format, 2)
  assert.equal('attrs' in original, false)
  assert.equal(migrateDocument(upgraded, { to: 2, steps: {} }), upgraded, 'an up-to-date document needs no step')
  assert.throws(() => migrateDocument(doc(), { to: 2, steps: {} }), /No migration from document format 1/)
  assert.equal(isNewerFormat(doc({ format: FORMAT_VERSION + 1 })), true)
})
