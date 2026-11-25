import test from 'node:test'
import assert from 'node:assert/strict'
import { Schema } from '@tiptap/pm/model'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { history, undo, redo } from '@tiptap/pm/history'
import us from 'dictionary-en'
import gb from 'dictionary-en-gb'
import { createEnglishSpelling } from './spelling-engine.js'
import { createSpellingClient } from './spelling-client.js'
import { spellingWord, spellingTarget, correctSpelling, spellingActions } from './spelling.js'

const schema=new Schema({
  nodes:{doc:{content:'block+'},paragraph:{group:'block',content:'inline*'},codeBlock:{group:'block',content:'text*',code:true,marks:''},image:{group:'inline',inline:true,atom:true},text:{group:'inline'}},
  marks:{bold:{},italic:{},textStyle:{attrs:{color:{default:null}}},code:{code:true},link:{attrs:{href:{default:''}}}}
})
const text=(value,marks=[])=>schema.text(value,marks),p=children=>schema.nodes.paragraph.create(null,typeof children==='string'?text(children):children)
const doc=children=>schema.nodes.doc.create(null,children)
function fixture(document){
  let state=EditorState.create({doc:document,plugins:[history()]})
  const editor={isEditable:true,isDestroyed:false,get state(){return state},view:{dispatch:tr=>{state=state.apply(tr)}},commands:{focus(){}}}
  return editor
}
test('English corrections cover the reported typo, transpositions, case, and both spelling conventions',()=>{
  const check=createEnglishSpelling([us,gb])
  for(const [word,expected] of [['discoverbility','discoverability'],['recieve','receive'],['Recieve','Receive'],['RECIEVE','RECEIVE'],['teh','the']])assert.equal(check(word).suggestions[0],expected,word)
  for(const word of ['discoverability','colour','color','organise','organize','don’t','Markdown','YouTube'])assert.equal(check(word).correct,true,word)
  for(const value of ['',null,'x'.repeat(49),'你好','123'])assert.equal(check(value),null)
})
test('word targeting crosses formatting boundaries without consuming punctuation or neighbours',()=>{
  const document=doc([p([text('Try “disco'),text('verbility',[schema.marks.bold.create()]),text('”, please.')])])
  for(const pos of [6,10,18])assert.deepEqual(spellingWord(document,pos),{doc:document,from:6,to:20,word:'discoverbility'})
  assert.equal(spellingWord(document,20)?.word,'discoverbility','a caret at the word end still targets it')
  assert.equal(spellingWord(document,21),null,'punctuation is not a word')
  assert.equal(spellingWord(document,-1),null)
})
test('code, links, identifiers, email, URLs, other scripts and embedded nodes are not prose targets',()=>{
  for(const [value,marks] of [['recieve',[schema.marks.code.create()]],['recieve',[schema.marks.link.create()]],['recieve_file',[]],['recieve@example.test',[]],['https://recieve.test',[]],['recieve42',[]],['こんにちは',[]]]){
    const document=doc([p(text(value,marks))]);assert.equal(spellingWord(document,3),null,value)
  }
  assert.equal(spellingWord(doc([schema.nodes.codeBlock.create(null,text('recieve'))]),3),null)
  const document=doc([p([text('recieve'),schema.nodes.image.create(),text('teh')])])
  assert.equal(spellingWord(document,11).word,'teh')
})
test('mouse targeting requires the actual word and keyboard targeting requires a caret or single word',()=>{
  const editor=fixture(doc([p('recieve please')])),target={closest:()=>null}
  editor.view.posAtCoords=()=>({pos:3})
  editor.view.domAtPos=pos=>({node:{},offset:pos})
  editor.view.dom={ownerDocument:{createRange:()=>({setStart(){},setEnd(){},getClientRects:()=>[{left:10,right:60,top:10,bottom:30}]})}}
  assert.equal(spellingTarget(editor,target,{source:'mouse',x:25,y:20}).word,'recieve')
  assert.equal(spellingTarget(editor,target,{source:'mouse',x:200,y:20}),null)
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc,1,8)))
  assert.equal(spellingTarget(editor,target,{source:'keyboard'}).word,'recieve')
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc,1,15)))
  assert.equal(spellingTarget(editor,target,{source:'keyboard'}),null)
  editor.isEditable=false
  assert.equal(spellingTarget(editor,target,{source:'mouse',x:25,y:20}),null)
})
test('corrections preserve mixed marks and only replace the clicked word',()=>{
  const bold=schema.marks.bold.create(),colour=schema.marks.textStyle.create({color:'#186ade'})
  const original=doc([p([text('Try disco'),text('verbility',[bold,colour]),text(' and recieve.')])]),editor=fixture(original)
  const word=spellingWord(original,8)
  assert.equal(correctSpelling(editor,word,'discoverability'),true)
  assert.equal(editor.state.doc.textContent,'Try discoverability and recieve.')
  assert.deepEqual(editor.state.doc.firstChild.content.toJSON(),[text('Try disco').toJSON(),text('verability',[bold,colour]).toJSON(),text(' and recieve.').toJSON()])
  assert.equal(editor.state.selection.from,word.from+'discoverability'.length)
  assert.ok(undo(editor.state,editor.view.dispatch))
  assert.ok(editor.state.doc.eq(original))
  assert.ok(redo(editor.state,editor.view.dispatch))
  assert.equal(editor.state.doc.textContent,'Try discoverability and recieve.')
})
test('a correction is a separate undo step from typing before and after it',()=>{
  const editor=fixture(doc([p('reciev')]))
  editor.view.dispatch(editor.state.tr.insertText('e',7))
  correctSpelling(editor,spellingWord(editor.state.doc,4),'receive')
  editor.view.dispatch(editor.state.tr.insertText('!',8))
  undo(editor.state,editor.view.dispatch);assert.equal(editor.state.doc.textContent,'receive')
  undo(editor.state,editor.view.dispatch);assert.equal(editor.state.doc.textContent,'recieve')
  undo(editor.state,editor.view.dispatch);assert.equal(editor.state.doc.textContent,'reciev')
})
test('stale spelling results cannot edit a changed document, another note, or a read-only editor',async()=>{
  const editor=fixture(doc([p('recieve')])),word=spellingWord(editor.state.doc,3),messages=[]
  let current=editor,resolve
  const options={editor,word,getEditor:()=>current,check:()=>new Promise(r=>resolve=r),toast:message=>messages.push(message)}
  const loading=spellingActions(options)
  editor.view.dispatch(editor.state.tr.insertText('!',8))
  resolve({correct:false,suggestions:['receive']})
  assert.deepEqual(await loading,[])
  assert.equal(correctSpelling(editor,word,'receive'),false)
  const freshWord=spellingWord(editor.state.doc,3)
  const actions=await spellingActions({...options,word:freshWord,check:async()=>({correct:false,suggestions:['receive']})})
  current=fixture(doc([p('Another note')]))
  actions[0].run();assert.equal(messages.length,1);assert.equal(editor.state.doc.textContent,'recieve!')
  editor.isEditable=false;assert.equal(correctSpelling(editor,freshWord,'receive'),false)
})
test('correct words stay out of the menu and missing suggestions or worker failure leave editing usable',async()=>{
  const editor=fixture(doc([p('recieve')])),options={editor,word:spellingWord(editor.state.doc,3),getEditor:()=>editor,toast(){}}
  assert.deepEqual(await spellingActions({...options,check:async()=>({correct:true,suggestions:[]})}),[])
  assert.equal((await spellingActions({...options,check:async()=>({correct:false,suggestions:[]})}))[0].label,'No spelling suggestions')
  assert.equal((await spellingActions({...options,check:async()=>{throw new Error('offline')}}))[0].disabled,true)
})
test('worker requests stay matched, time out safely, and release note words on disposal',async()=>{
  const workers=[]
  class FakeWorker{
    constructor(){this.sent=[];workers.push(this)}
    postMessage(message){this.sent.push(message)}
    terminate(){this.terminated=true}
  }
  const client=createSpellingClient({url:'/spelling.js',WorkerClass:FakeWorker,timeoutMs:30,idleMs:1000})
  assert.equal(workers.length,0,'dictionaries load only when spelling is requested')
  const first=client.check('recieve'),second=client.check('teh'),worker=workers[0]
  worker.onmessage({data:{id:worker.sent[1].id,result:{suggestions:['the']}}})
  assert.deepEqual(await second,{suggestions:['the']})
  worker.onmessage({data:{id:worker.sent[0].id,result:{suggestions:['receive']}}})
  assert.deepEqual(await first,{suggestions:['receive']})
  const pending=client.check('private');const rejection=assert.rejects(pending,/unavailable/)
  client.dispose();await rejection;assert.ok(worker.terminated)
  await assert.rejects(client.check('timeout'),/unavailable/)
  assert.ok(workers[1].terminated)
  client.dispose()
})
