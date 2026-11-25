import test from 'node:test'
import assert from 'node:assert/strict'
import { Editor, Node, Extension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import { TextStyle, TextHighlight } from './text-formatting.js'
import { TableAppearance } from './table-appearance.js'
import * as md from './markdown.js'

const Attachment = Node.create({name:'previewAttachment',group:'block',atom:true,addAttributes:()=>({source:{default:null},label:{default:'Image'},detail:{default:''}}),...md.markdownImage})
const Flow = Extension.create({name:'testFlow',addGlobalAttributes:()=>[{types:['table','previewAttachment'],attributes:{documentFlow:{default:false}}}]})
const make = () => new Editor({ element:null, enablePasteRules:false, content:{type:'doc',content:[{type:'paragraph'}]}, extensions:[StarterKit,TableKit,Flow,TableAppearance,TaskList,TaskItem.configure({nested:true}),Attachment,TextStyle,TextHighlight,md.NoteMarkdown,md.MarkdownPaste,md.NoteInlineMath,md.NoteBlockMath,md.FootnoteReference,md.FootnoteDefinition,md.Superscript,md.Subscript,md.SafeBlockHTML,md.SafeInlineHTML,md.LiteralHTML] })
const all = doc => [doc,...(doc.content || []).flatMap(all)]
const types = (doc,type) => all(doc).filter(node=>node.type===type)
function check(source, run) { const editor = make(); try { const doc=md.parseMarkdown(editor,source); run(doc,editor) } finally { editor.destroy() } }

test('CommonMark headings, setext, nested emphasis, quotes, breaks and literal code map to editable nodes',()=>{
  const source = '# One\n\n## Two\n\n### Three\n\n#### Four\n\n##### Five\n\n###### Six\n\nSetext\n======\n\n**bold _italic_** and ~~strike~~ ==highlight== `code`\n\n> quote\n>\n> second\n\nline  \nbreak\n\n---\n\n```js\nconst x = "**literal**";\n<script>literal</script>\n```\n\n    indented code';
  check(source,doc=>{
    assert.deepEqual(types(doc,'heading').map(n=>n.attrs.level),[1,2,3,4,5,6,1]);
    assert.deepEqual(types(doc,'text').find(n=>n.text==='italic').marks.map(m=>m.type).sort(),['bold','italic']);
    assert.equal(types(doc,'blockquote').length,1); assert.equal(types(doc,'hardBreak').length,1); assert.equal(types(doc,'horizontalRule').length,1);
    assert.equal(types(doc,'codeBlock').length,2); assert.equal(types(doc,'codeBlock')[0].attrs.language,'js');
    assert.match(types(doc,'codeBlock')[0].content[0].text, /<script>literal<\/script>/);
  });
});
test('GFM preserves mixed tasks, nested lists, ordered starts, table alignment and formatted cells',()=>check('- [x] done\n- [ ] open\n  - child\n- ordinary\n\n4. Fourth\n5. Fifth\n\n| Name | Amount |\n| :--- | ---: |\n| **One** | `2` |',doc=>{
  assert.deepEqual(types(doc,'taskItem').map(n=>n.attrs.checked),[true,false]);
  assert.equal(types(doc,'orderedList')[0].attrs.start,4);
  assert.equal(types(doc,'bulletList').length,2);
  assert.deepEqual(types(doc,'tableHeader').map(n=>n.attrs.align),['left','right']);
  assert.equal(types(doc,'tableCell')[0].content[0].content[0].marks[0].type,'bold');
  assert.equal(types(doc,'table')[0].attrs.documentFlow,true);
}));
test('equations and multiline footnotes survive parse, serialize and saved JSON',()=>check('Energy $E=mc^2$.[^source]\n\n$$\n\\frac{a}{b} = c\n$$\n\n[^source]: **First** paragraph.\n\n    Another with $x^2$.\n\n    - A list', (doc,editor)=>{
  assert.equal(types(doc,'inlineMath').length,2); assert.equal(types(doc,'blockMath').length,1);
  assert.equal(types(doc,'footnoteDefinition')[0].content.length,3);
  const saved=editor.schema.nodeFromJSON(doc).toJSON();
  assert.deepEqual(editor.schema.nodeFromJSON(saved).toJSON(),saved);
  const round=md.parseMarkdown(editor,editor.markdown.serialize(doc));
  assert.deepEqual(round,doc);
}));
test('currency, escaped math and fenced equations stay literal; repeated footnotes receive distinct targets',()=>check('Pay $5 and $10. Escaped \\$x$ and ` $y$ `.\n\n```\n$$x$$\n[^no]\n```\n\nReference[^a]\n\n[^a]: Existing', (doc,editor)=>{
  assert.equal(types(doc,'inlineMath').length,0); assert.equal(types(doc,'blockMath').length,0);
  editor.commands.setContent(doc);
  const next=md.parseMarkdown(editor,'Another[^a]\n\n[^a]: New');
  assert.equal(types(next,'footnoteReference')[0].attrs.label,'a-2');
  assert.equal(types(next,'footnoteDefinition')[0].attrs.label,'a-2');
}));
test('images retain source and alt text as canvas objects, including between words and within lists',()=>check('Before ![Diagram](https://example.com/chart.png "Title") after\n\n- ![Nested](https://example.com/nested.png)\n\n![Reference][image]\n\n[image]: https://example.com/reference.png',doc=>{
  assert.deepEqual(types(doc,'previewAttachment').map(n=>n.attrs.label),['Diagram','Nested','Reference']);
  assert.equal(types(doc,'previewAttachment')[0].attrs.detail,'Title');
  assert.ok(types(doc,'previewAttachment').every(node=>node.attrs.documentFlow));
  assert.equal(types(doc,'listItem')[0].content[0].type,'paragraph');
}));
test('unsafe links/images remain harmless, reference links and email links retain destinations',()=>check('[bad](javascript:alert%281%29) ![bad](data:text/html,no)\n\n[Site][ref] <hello@example.com>\n\n[ref]: https://example.com\n\n<script>alert(1)</script>',doc=>{
  const links=types(doc,'text').flatMap(n=>n.marks||[]).filter(m=>m.type==='link');
  assert.deepEqual(links.map(m=>m.attrs.href),['https://example.com/','mailto:hello@example.com']);
  assert.equal(types(doc,'previewAttachment').length,0);
  assert.ok(types(doc,'text').some(n=>n.text.includes('<script>')));
}));
test('automatic paste detection leaves ordinary prose, prices and escaped delimiters alone',()=>{
  for(const text of ['Plain words','Pay $5 and $10','a * b','snake_case','https://example.com']) assert.equal(md.looksLikeMarkdown(text),false,text);
  for(const text of ['# Title','**bold**','*italic*','[link](https://example.com)','| A | B |\n| --- | --- |','[^a]: Footnote','$x^2$']) assert.equal(md.looksLikeMarkdown(text),true,text);
});
test('parsing is bounded, schema checked, and isolated across editor instances',()=>{
  const first=make(),second=make();
  try {
    assert.throws(()=>md.parseMarkdown(first,'x'.repeat(md.markdownLimit+1)),/200,000/);
    assert.deepEqual(md.parseMarkdown(first,'$x$[^a]'),md.parseMarkdown(second,'$x$[^a]'));
    first.destroy(); assert.equal(types(md.parseMarkdown(second,'$y$'),'inlineMath').length,1);
  } finally { if(!first.isDestroyed)first.destroy();second.destroy() }
});
test('paste honors literal mode and code context while preserving Markdown on ordinary paste',()=>{
  const editor=make();
  try {
    const parser=editor.extensionManager.plugins.find(plugin=>plugin.props.clipboardTextParser)?.props.clipboardTextParser;
    assert.ok(parser);
    const context=editor.state.selection.$from;
    assert.equal(parser('**literal**',context,true),null);
    assert.equal(parser('ordinary prose',context,false),null);
    const rich=parser('**bold**',context,false);
    assert.equal(rich.content.firstChild.firstChild.marks[0].type.name,'bold');
    editor.commands.setCodeBlock();
    assert.equal(parser('**literal**',editor.state.selection.$from,false),null);
  } finally {editor.destroy()}
});

test('long Markdown pastes survive inline code within emphasis and links', () => {
  const editor = make()
  try {
    const parser = editor.extensionManager.plugins.find(plugin => plugin.props.clipboardTextParser).props.clipboardTextParser
    const section = '## Commands\n\n- **Run `tool check` first.**\n- [Use `tool help`](https://example.com) for options.\n\n| Step | Status |\n| --- | --- |\n| 1 | Ready |\n\n'
    const source = '# Guide\n\n' + section.repeat(350) + '## End of guide\n'
    const slice = parser(source, editor.state.selection.$from, false)
    assert.ok(slice)
    assert.equal(slice.content.firstChild.textContent, 'Guide')
    assert.equal(slice.content.lastChild.textContent, 'End of guide')
    const doc = { type: 'doc', content: slice.content.toJSON() }
    assert.equal(types(doc, 'table').length, 350)
    const marksFor = text => types(doc, 'text').find(node => node.text === text).marks.map(mark => mark.type)
    assert.deepEqual(marksFor('Run '), ['bold'])
    assert.deepEqual(marksFor('tool check'), ['code'])
    assert.deepEqual(marksFor('Use '), ['link'])
    assert.deepEqual(marksFor('tool help'), ['code'])
  } finally { editor.destroy() }
})
