import { TextSelection } from '@tiptap/pm/state'
import { closeHistory } from '@tiptap/pm/history'

export function spellingWord(doc,pos){
  if(!Number.isInteger(pos)||pos<0||pos>doc.content.size)return null
  const resolved=doc.resolve(pos),block=resolved.parent
  if(!block.isTextblock||block.type.spec.code)return null
  const text=block.textBetween(0,block.content.size,'','\ufffc'),offset=resolved.parentOffset
  const words=[...text.matchAll(/[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu)]
  const match=words.find(word=>word.index<=offset&&offset<word.index+word[0].length)||words.find(word=>word.index+word[0].length===offset)
  if(!match)return null
  const word=match[0],start=match.index,end=start+word.length
  if(word.length<2||word.length>48||!/^\p{Script=Latin}[\p{Script=Latin}\p{M}'’]*$/u.test(word))return null
  // Don't offer prose corrections for identifiers, email addresses or URLs.
  const token=text.slice(0,start).match(/\S*$/)[0]+word+text.slice(end).match(/^\S*/)[0]
  if(/[@_\d]|:\/\/|www\.|[\p{L}]\.[\p{L}]/u.test(token))return null
  const from=resolved.start()+start,to=from+word.length
  let excluded=false
  doc.nodesBetween(from,to,node=>{if(node.isInline&&(!node.isText||node.marks.some(mark=>mark.type.spec.code||mark.type.name==='link')))excluded=true})
  return excluded?null:{doc,from,to,word}
}

export function spellingTarget(editor,target,point){
  if(!editor?.isEditable||editor.isDestroyed||target.closest('.fn-attachment,.fn-code-block,[contenteditable="false"]'))return null
  const selection=editor.state.selection
  if(selection.node||selection.$anchorCell)return null
  const pos=point.source==='mouse'?editor.view.posAtCoords({left:point.x,top:point.y})?.pos:selection.from
  const word=spellingWord(editor.state.doc,pos)
  if(!word)return null
  if(point.source!=='mouse'&&!selection.empty&&(selection.from!==word.from||selection.to!==word.to))return null
  if(point.source==='mouse'){
    // posAtCoords snaps clicks in blank space to nearby text. Require a hit on
    // the actual word, including words split across marks or wrapped lines.
    const start=editor.view.domAtPos(word.from),end=editor.view.domAtPos(word.to),range=editor.view.dom.ownerDocument.createRange()
    range.setStart(start.node,start.offset);range.setEnd(end.node,end.offset)
    const hit=[...range.getClientRects()].some(rect=>point.x>=rect.left-2&&point.x<=rect.right+2&&point.y>=rect.top&&point.y<=rect.bottom)
    if(!hit)return null
  }
  return word
}

// Align replacement characters with the original so partial bold, colour, and
// other marks survive corrections, even when letters are inserted or removed.
function replacementNodes(doc,from,word,replacement){
  const costs=Array.from({length:word.length+1},(_,i)=>Array.from({length:replacement.length+1},(_,j)=>i?j?0:i:j))
  for(let i=1;i<=word.length;i++)for(let j=1;j<=replacement.length;j++)costs[i][j]=Math.min(costs[i-1][j]+1,costs[i][j-1]+1,costs[i-1][j-1]+(word[i-1]===replacement[j-1]?0:1))
  let i=word.length,j=replacement.length
  const source=[]
  while(i||j){
    if(i&&j&&costs[i][j]===costs[i-1][j-1]+(word[i-1]===replacement[j-1]?0:1)){source[--j]=--i}
    else if(i&&costs[i][j]===costs[i-1][j]+1)i--
    else source[--j]=Math.min(i,word.length-1)
  }
  return [...replacement].map((char,index)=>doc.type.schema.text(char,doc.resolve(from+source[index]).nodeAfter?.marks||[]))
}

export function correctSpelling(editor,word,replacement){
  if(!editor?.isEditable||editor.isDestroyed||editor.state.doc!==word.doc||typeof replacement!=='string'||!replacement||replacement.length>96)return false
  const tr=closeHistory(editor.state.tr).replaceWith(word.from,word.to,replacementNodes(word.doc,word.from,word.word,replacement))
  tr.setSelection(TextSelection.create(tr.doc,word.from+replacement.length))
  editor.view.dispatch(tr.scrollIntoView())
  // Keep both the preceding typing and subsequent typing out of this undo step.
  editor.view.dispatch(closeHistory(editor.state.tr))
  editor.commands.focus()
  return true
}

export async function spellingActions({editor,word,getEditor,check,toast}){
  const current=()=>getEditor()===editor&&!editor.isDestroyed&&editor.isEditable&&editor.state.doc===word.doc
  try{
    const result=await check(word.word)
    if(!current()||!result||result.correct)return []
    if(!result.suggestions.length)return [{label:'No spelling suggestions',disabled:true}]
    return result.suggestions.map(label=>({label,icon:'spell-check',run:()=>{
      if(!current()||!correctSpelling(editor,word,label))toast('The text changed. Right-click the word again.')
    }}))
  }catch{
    return current()?[{label:'Spelling temporarily unavailable',disabled:true}]:[]
  }
}
