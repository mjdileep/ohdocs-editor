import { Extension } from '@tiptap/core'
import { FORMAT_VERSION } from '../format/schema.mjs'

// Keeps a document's format version on its doc node, so every saved document
// says which format it is in and older editors open it read-only (see
// format/schema.mjs). Format 1 documents carry no marker, so the attribute only
// exists from format 2 on and saved JSON stays exactly as it is until then.
// A document that reaches the editor without a marker has already been migrated
// (loadableDocument), so it takes this editor's own version.
export function documentFormatExtension(version = FORMAT_VERSION) {
  return Extension.create({
    name: 'documentFormat',
    addGlobalAttributes: () => version > 1 ? [{ types: ['doc'], attributes: { format: { default: version, rendered: false } } }] : [],
  })
}

export const DocumentFormat = documentFormatExtension()
