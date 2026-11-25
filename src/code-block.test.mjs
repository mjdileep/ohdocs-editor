import test from 'node:test'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { NoteMarkdown, parseMarkdown } from './markdown.js'
import { NoteCodeBlock, codeLanguage, codeLanguageLabel, codeLanguages, createCodeHighlighter, codeHighlightLimit, changeCodeLanguage, detectCodeLanguage, ignoreCodeMutation } from './code-block.js'

const codeHighlighter = createCodeHighlighter()
const source = 'const greeting = "👋 <b>& hello";\n\tconsole.log(greeting);\n'
const block = (language, text = source) => ({type:'codeBlock',attrs:{language},content:[{type:'text',text}]})
const make = content => {
  const editor=new Editor({element:null,extensions:[StarterKit.configure({codeBlock:false}),NoteCodeBlock,NoteMarkdown],content:{type:'doc',content}})
  editor.view.updateState(editor.state.reconfigure({plugins:editor.extensionManager.plugins}))
  editor.view.dispatch(editor.state.tr.setMeta('addToHistory',false))
  return editor
}
const flatten = tree => tree.type === 'text' ? tree.value : (tree.children || []).map(flatten).join('')
const classes = tree => [...(tree.properties?.className || []), ...(tree.children || []).flatMap(classes)]
const highlights = editor => editor.state.plugins.find(p=>p.key.startsWith('lowlight$')).getState(editor.state).find()

test('code display updates cannot trigger document reparsing, but typing and selection still can', () => {
  const text = {}, token = {}, toolbar = {}
  const code = { contains: target => [code, text, token].includes(target) }
  assert.equal(ignoreCodeMutation(code, { type: 'attributes', target: code, attributeName: 'class' }), true,
    'language decoration is not a content edit, even when another object is selected')
  assert.equal(ignoreCodeMutation(code, { type: 'childList', target: toolbar }), true)
  for (const mutation of [
    { type: 'characterData', target: text },
    { type: 'childList', target: code },
    { type: 'childList', target: token },
    { type: 'attributes', target: token, attributeName: 'class' },
    { type: 'selection', target: code },
    { type: 'selection', target: toolbar },
  ]) assert.equal(ignoreCodeMutation(code, mutation), false, `${mutation.type} remains observable`)
})

test('language aliases and fenced metadata select registered grammars without guessing unknown code',()=>{
  for (const [input,want] of [['js','javascript'],['TSX','typescript'],['python linenums','python'],['html','xml'],['sh','bash'],['C++','cpp'],['yml','yaml'],[null,'auto'],['','auto'],['<script>','plaintext']]) assert.equal(codeLanguage(input),want)
  assert.equal(codeLanguageLabel('js'),'JavaScript')
  assert.equal(codeLanguageLabel('custom-dsl'),'custom-dsl (plain text)')
  for (const [language] of codeLanguages) assert.ok(codeHighlighter.registered(language),language)
  assert.ok(classes(codeHighlighter.highlight('js',source)).includes('hljs-keyword'))
  assert.ok(classes(codeHighlighter.highlight('py','def greet(name):\n  return name')).includes('hljs-title'))
  assert.ok(classes(codeHighlighter.highlight('sql','SELECT id FROM notes WHERE id = 4')).includes('hljs-keyword'))
  assert.ok(classes(codeHighlighter.highlightAuto(source)).includes('hljs-keyword'))
})

test('unset languages detect common code, leave uncertain text plain, and never rewrite the source',()=>{
  const examples = [
    ['javascript','function add(a, b) { return a + b; }'],
    ['typescript','export const add = (a: number, b: number): number => a + b;'],
    ['python','def greet(name):\n    return f"Hello, {name}!"\n\nprint(greet("SafeFN"))'],
    ['sql','SELECT id, title FROM notes WHERE shared = true;'],
    ['json','{\n  "enabled": true,\n  "retries": 3\n}'],
    ['bash','.venv/bin/python -m mms_insights widget work-order --record WO-20261111-065 --format pretty'],
    ['plaintext','This is an ordinary sentence, not a program.'], ['plaintext','start -> finish'], ['plaintext',''],
  ]
  for (const [language,text] of examples) { assert.equal(detectCodeLanguage(text),language); assert.equal(flatten(codeHighlighter.highlightAuto(text)),text) }
  assert.equal(detectCodeLanguage(source.repeat(codeHighlightLimit)), 'plaintext')
  const editor=make([block(null),block('plaintext'),block('custom-dsl')])
  try {
    const before=editor.getJSON(), second=editor.state.doc.firstChild.nodeSize
    assert.ok(highlights(editor).length)
    assert.ok(highlights(editor).every(d=>d.to<second))
    assert.deepEqual(editor.getJSON(),before)
    changeCodeLanguage(editor,0,'plaintext'); assert.equal(highlights(editor).length,0)
    changeCodeLanguage(editor,0,'auto'); assert.equal(editor.state.doc.firstChild.attrs.language,null)
    assert.ok(highlights(editor).length)
    editor.commands.undo(); assert.equal(editor.state.doc.firstChild.attrs.language,'plaintext')
    editor.commands.redo(); assert.equal(editor.state.doc.firstChild.attrs.language,null)
    assert.equal(editor.state.doc.firstChild.textContent,source)
    const python='def greet(name):\n    return name'
    editor.view.dispatch(editor.state.tr.insertText(python,1,editor.state.doc.firstChild.nodeSize-1))
    assert.equal(editor.storage.codeBlock.highlighter.detect(python),'python')
    assert.ok(highlights(editor).some(d=>editor.state.doc.textBetween(d.from,d.to)==='def'))
    assert.equal(editor.state.doc.firstChild.attrs.language,null)
  } finally {editor.destroy()}
})

test('highlighting preserves literal text, whitespace and Unicode; unknown and oversized blocks stay plain',()=>{
  const text = '\tconst a = "👋 <script>alert(1)</script> &";\r\n\n'
  for (const language of ['js','html','plaintext','unknown','constructor','__proto__','toString']) assert.equal(flatten(codeHighlighter.highlight(language,text)),text)
  assert.deepEqual(classes(codeHighlighter.highlight('unknown',text)),[])
  const large = source.repeat(Math.ceil(codeHighlightLimit/source.length)+1)
  const tree=codeHighlighter.highlight('javascript',large)
  assert.equal(flatten(tree),large); assert.deepEqual(classes(tree),[])
})

test('decorations never change saved code and map token offsets after Unicode and edits',()=>{
  const editor=make([block('javascript')])
  try {
    const saved=editor.getJSON()
    assert.ok(highlights(editor).some(d=>editor.state.doc.textBetween(d.from,d.to)==='const'))
    assert.ok(highlights(editor).some(d=>editor.state.doc.textBetween(d.from,d.to)==='"👋 <b>& hello"'))
    assert.deepEqual(editor.getJSON(),saved)
    editor.view.dispatch(editor.state.tr.insertText('// intro 👋\n',1))
    assert.ok(highlights(editor).some(d=>editor.state.doc.textBetween(d.from,d.to)==='const'))
    assert.equal(editor.state.doc.firstChild.textContent,'// intro 👋\n'+source)
    assert.equal(editor.getJSON().content[0].content[0].marks,undefined)
  } finally {editor.destroy()}
})

test('language changes target the picked block, preserve content, and are isolated undo steps',()=>{
  const editor=make([block('js'),block('plaintext','def square(x):\n    return x * x\n')])
  try {
    const second=editor.state.doc.firstChild.nodeSize, before=editor.getJSON()
    editor.commands.setTextSelection(2)
    assert.equal(changeCodeLanguage(editor,second,'python'),true)
    assert.equal(editor.state.doc.firstChild.attrs.language,'js')
    assert.equal(editor.state.doc.child(1).attrs.language,'python')
    assert.equal(editor.state.doc.child(1).textContent,before.content[1].content[0].text)
    assert.ok(highlights(editor).some(d=>d.from>second&&editor.state.doc.textBetween(d.from,d.to)==='def'))
    editor.commands.undo(); assert.deepEqual(editor.getJSON(),before)
    editor.commands.redo(); assert.equal(editor.state.doc.child(1).attrs.language,'python')
    editor.view.dispatch(editor.state.tr.insertText('# keep this edit\n',second+1))
    changeCodeLanguage(editor,second,'plaintext')
    assert.equal(highlights(editor).filter(d=>d.from>second).length,0)
    editor.commands.undo()
    assert.equal(editor.state.doc.child(1).attrs.language,'python')
    assert.ok(editor.state.doc.child(1).textContent.startsWith('# keep this edit\n'))
    editor.setEditable(false)
    assert.equal(changeCodeLanguage(editor,second,'javascript'),false)
    assert.equal(editor.state.doc.child(1).attrs.language,'python')
  } finally {editor.destroy()}
})

test('Markdown fence languages round-trip in the real code extension, including unrecognised languages',()=>{
  const editor=make([{type:'paragraph'}])
  try {
    const doc=parseMarkdown(editor,'```js\nconst x = "literal **text**";\n```\n\n```custom-dsl\na -> b\n```\n\n```\ndef greet(name):\n    return name\n```')
    assert.equal(doc.content[0].attrs.language,'js'); assert.equal(doc.content[1].attrs.language,'custom-dsl')
    assert.equal(doc.content[2].attrs.language,null)
    editor.commands.setContent(doc)
    assert.deepEqual(parseMarkdown(editor,editor.markdown.serialize(doc)),doc)
    assert.ok(highlights(editor).length)
    assert.equal(editor.state.doc.firstChild.textContent,'const x = "literal **text**";')
  } finally {editor.destroy()}
})

test('code placement keeps editable text and language through move, undo and reload',async()=>{
  const {canvasTransaction}=await import('./canvas-flow.js')
  const editor=make([block('javascript'),{type:'paragraph',content:[{type:'text',text:'After'}]}])
  try {
    const before=editor.getJSON(),node=editor.state.doc.firstChild
    assert.equal(node.attrs.documentFlow,true)
    const item={node,pos:0,box:{x:100,y:210,width:300,height:90},layer:4}
    editor.view.dispatch(canvasTransaction(editor.state,[item],800,0))
    const moved=editor.getJSON()
    assert.equal(moved.content[0].attrs.layout,'canvas');assert.equal(moved.content[0].attrs.documentFlow,false)
    assert.equal(moved.content[0].content[0].text,source)
    editor.commands.undo();assert.deepEqual(editor.getJSON(),before)
    editor.commands.redo();assert.deepEqual(editor.getJSON(),moved)
    editor.commands.setContent(moved)
    editor.view.dispatch(editor.state.tr.insertText('// moved\n',1))
    assert.equal(editor.state.doc.firstChild.attrs.canvasWidth,300)
    assert.equal(editor.state.doc.firstChild.attrs.language,'javascript')
    assert.ok(editor.state.doc.firstChild.textContent.startsWith('// moved\n'))
  } finally {editor.destroy()}
})
