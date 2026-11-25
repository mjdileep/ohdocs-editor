// The saved document format, shared by every app that stores editor documents.
// A document is Tiptap/ProseMirror JSON: { type: 'doc', content: [...] }.
//
// Bump FORMAT_VERSION whenever saved documents can contain a node type, mark or
// attribute that the previous editor does not know. Older editors (for example
// a cached app bundle) then open those documents read-only instead of silently
// dropping the new content when they save. A change that renames or reshapes
// existing content also needs a migration step below.
//
// Format 1 documents carry no marker. From format 2 on, the editor records the
// format as doc.attrs.format.
export const FORMAT_VERSION = 3;

// Every node type the editor saves. Apps reject documents with anything else.
export const nodeTypes = new Set(['doc', 'paragraph', 'text', 'heading', 'bulletList', 'orderedList', 'listItem', 'taskList', 'taskItem', 'blockquote', 'codeBlock', 'hardBreak', 'horizontalRule', 'table', 'tableRow', 'tableCell', 'tableHeader', 'details', 'detailsContent', 'detailsSummary', 'previewAttachment', 'noteReference', 'inlineMath', 'blockMath', 'footnoteReference', 'footnoteDefinition']);

// Every mark type the editor saves.
export const markTypes = new Set(['bold', 'italic', 'underline', 'strike', 'code', 'link', 'textStyle', 'highlight', 'superscript', 'subscript']);

// Nodes whose children are inline: unknown content inside them is inline too.
const inlineParents = new Set(['paragraph', 'heading', 'codeBlock', 'detailsSummary']);

export function validDoc(node, depth = 0, state = { count: 0 }) {
  if (!node || typeof node !== 'object' || depth > 32 || ++state.count > 20000 || !nodeTypes.has(node.type)) return false;
  if (node.text !== undefined && (typeof node.text !== 'string' || node.text.length > 200000)) return false;
  if (node.content && (!Array.isArray(node.content) || !node.content.every(child => validDoc(child, depth + 1, state)))) return false;
  return true;
}

export function documentFormat(doc) {
  const format = doc?.attrs?.format;
  return Number.isInteger(format) && format > 0 ? format : 1;
}

// True when a document was saved by a newer editor than this one.
export const isNewerFormat = doc => documentFormat(doc) > FORMAT_VERSION;

// Upgrade steps, keyed by the format they upgrade from: { 1: doc => ... }.
// Size overrides are optional. Existing objects retain their intrinsic geometry.
const migrations = { 1: doc => doc, 2: doc => doc };

// Bring an older document up to FORMAT_VERSION and record the format it now
// has. Runs where the document is opened, because end-to-end encrypted
// documents never reach a server readable. `to` and `steps` exist for tests.
export function migrateDocument(doc, { to = FORMAT_VERSION, steps = migrations } = {}) {
  if (!doc || typeof doc !== 'object') return doc;
  let format = documentFormat(doc);
  if (format >= to) return doc;
  for (; format < to; format++) {
    const step = steps[format];
    if (!step) throw new Error(`No migration from document format ${format}`);
    doc = step(structuredClone(doc));
  }
  // Format 1 has no marker; later formats are recorded so older editors treat them as newer.
  return to > 1 ? { ...doc, attrs: { ...doc.attrs, format: to } } : doc;
}

// A copy of a newer document that this editor can show read-only. Content it
// does not know becomes a short note instead of the whole document failing to
// open. Never save the result: it is for display only.
export function displayableDocument(doc) {
  const unknownBlock = { type: 'paragraph', content: [{ type: 'text', text: 'This part needs a newer version of the app.' }] };
  const visit = (node, inline) => {
    if (!node || typeof node !== 'object' || !nodeTypes.has(node.type)) return inline ? { type: 'text', text: '[…]' } : structuredClone(unknownBlock);
    const copy = { ...node };
    if (Array.isArray(node.marks)) copy.marks = node.marks.filter(mark => markTypes.has(mark?.type));
    if (Array.isArray(node.content)) copy.content = node.content.map(child => visit(child, inlineParents.has(node.type)));
    return copy;
  };
  return visit(doc, false);
}
