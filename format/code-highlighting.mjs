import { common, createLowlight } from 'lowlight';

const lowlight = createLowlight(common)
const labels = {
  plaintext: 'Plain text', arduino: 'Arduino', bash: 'Bash', c: 'C', cpp: 'C++', csharp: 'C#',
  css: 'CSS', diff: 'Diff', go: 'Go', graphql: 'GraphQL', ini: 'INI / TOML', java: 'Java',
  javascript: 'JavaScript', json: 'JSON', kotlin: 'Kotlin', less: 'Less', lua: 'Lua',
  makefile: 'Makefile', markdown: 'Markdown', objectivec: 'Objective-C', perl: 'Perl',
  php: 'PHP', 'php-template': 'PHP template', python: 'Python', 'python-repl': 'Python console',
  r: 'R', ruby: 'Ruby', rust: 'Rust', scss: 'SCSS', shell: 'Shell session', sql: 'SQL',
  swift: 'Swift', typescript: 'TypeScript', vbnet: 'Visual Basic', wasm: 'WebAssembly',
  xml: 'HTML / XML', yaml: 'YAML',
}
const aliases = {
  text: 'plaintext', txt: 'plaintext', plain: 'plaintext', js: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript', html: 'xml', htm: 'xml', svg: 'xml', xhtml: 'xml',
  py: 'python', py3: 'python', pycon: 'python-repl', sh: 'bash', zsh: 'bash', console: 'shell',
  cs: 'csharp', 'c#': 'csharp', 'c++': 'cpp', cc: 'cpp', h: 'c', hpp: 'cpp',
  rb: 'ruby', rs: 'rust', yml: 'yaml', md: 'markdown', mk: 'makefile', toml: 'ini',
  kt: 'kotlin', kts: 'kotlin', objc: 'objectivec', pl: 'perl', patch: 'diff',
}
export const codeLanguages = [['auto', 'Auto-detect'], ['plaintext', labels.plaintext], ...Object.entries(labels)
  .filter(([id]) => id !== 'plaintext').sort((a,b) => a[1].localeCompare(b[1]))]

export function codeLanguage(value) {
  const name = typeof value === 'string' ? value.trim().toLowerCase().split(/\s/, 1)[0] : ''
  if (!name) return 'auto'
  return /^[\w.+#-]{1,64}$/.test(name) ? (Object.hasOwn(aliases, name) ? aliases[name] : name) : 'plaintext'
}
export const codeLanguageLabel = value => { const name = codeLanguage(value); return name === 'auto' ? 'Auto-detect' : Object.hasOwn(labels, name) ? labels[name] : `${name} (plain text)` }
export const codeHighlightLimit = 30000
const plain = text => ({ type: 'root', children: [{ type: 'text', value: text }] })
const detectionLanguages = ['javascript', 'typescript', 'python', 'json', 'xml', 'css', 'sql', 'bash', 'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'ruby', 'php', 'swift', 'kotlin', 'diff']

export function detectCodeLanguage(text) {
  if (text.length > codeHighlightLimit || !text.trim()) return 'plaintext'
  const sample = text.slice(0, 4000)
  // Strong signatures avoid common grammar ties (for example JS mistaken for CSS).
  if (/^#!.*\bpython[\d.]*\b/.test(sample)) return 'python'
  if (/^#!.*\b(?:ba|z|k)?sh\b/.test(sample) || /^\s*(?:\$\s+|(?:\.?\.?\/|\.venv\/|\/(?:usr|bin)\/))\S+[^\n]*\s--?[\w-]+/m.test(sample)) return 'bash'
  if (/^\s*[\[{]/.test(sample)) { try { const value = JSON.parse(text); if (value && typeof value === 'object') return 'json' } catch {} }
  if (/\b(?:interface\s+\w+\s*\{|type\s+\w+\s*=)|\b(?:const|let)\s+\w+\s*:\s*\w+|\([^)]*:\s*(?:string|number|boolean)\b/.test(sample)) return 'typescript'
  if (/\b(?:const|let|var)\s+\w+\s*=|\b(?:async\s+)?function\s+\w+\s*\(|(?:\([^)]*\)|\w+)\s*=>/.test(sample)) return 'javascript'
  if (/^\s*(?:SELECT\b[\s\S]*?\bFROM|INSERT\s+INTO|UPDATE\b[\s\S]*?\bSET|CREATE\s+TABLE)\b/im.test(sample)) return 'sql'
  try {
    const result = lowlight.highlightAuto(sample, { subset: detectionLanguages })
    return result.data?.relevance >= 3 ? result.data.language : 'plaintext'
  } catch { return 'plaintext' }
}

function highlightCode(language, text, detect) {
  language = codeLanguage(language)
  if (language === 'auto') language = detect(text)
  if (language === 'plaintext' || text.length > codeHighlightLimit || !Object.hasOwn(labels, language)) return plain(text)
  try { return lowlight.highlight(language, text) } catch { return plain(text) }
}
export function createCodeHighlighter() {
  // Bounded to this editor, cleared on destroy, and shared by decorations/labels.
  const guesses = new Map()
  const detect = text => {
    if (text.length > codeHighlightLimit) return 'plaintext'
    const key = text
    if (guesses.has(key)) return guesses.get(key)
    const language = detectCodeLanguage(text)
    if (guesses.size >= 32) guesses.delete(guesses.keys().next().value)
    guesses.set(key, language)
    return language
  }
  return {
    listLanguages: () => lowlight.listLanguages(),
    // Handle explicit unknown types ourselves, rather than guessing over them.
    registered: () => true,
    highlight: (language, text) => highlightCode(language, text, detect),
    highlightAuto: text => highlightCode('auto', text, detect),
    detect,
    clear: () => guesses.clear(),
  }
}

