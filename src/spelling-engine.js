import nspell from 'nspell'

// Common editor/product vocabulary missing from the bundled general dictionaries.
const vocabulary=['SafeFN','discoverability','discoverable','selectability','selectable','resizable','undoable','codebase','codebases','dropdown','dropdowns','fullscreen','recolour','recoloured','recolouring']
function distance(a,b){
  const costs=Array.from({length:a.length+1},(_,i)=>Array.from({length:b.length+1},(_,j)=>i?j?0:i:j))
  for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){
    costs[i][j]=Math.min(costs[i-1][j]+1,costs[i][j-1]+1,costs[i-1][j-1]+(a[i-1]===b[j-1]?0:1))
    // Swapped adjacent letters are a common typo, usually more likely than a
    // different short word ("teh" → "the", before "ten" or "tea").
    if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])costs[i][j]=Math.min(costs[i][j],costs[i-2][j-2]+.75)
  }
  return costs[a.length][b.length]
}

// Dictionaries and all queries stay on this device, inside a dedicated worker.
export function createEnglishSpelling(dictionaries){
  const engines=dictionaries.map(dictionary=>nspell(dictionary))
  for(const engine of engines)for(const word of vocabulary)engine.add(word)
  return word=>{
    if(typeof word!=='string'||word.length<2||word.length>48||!/^\p{Script=Latin}[\p{Script=Latin}\p{M}'’]*$/u.test(word))return null
    const normalized=word.normalize('NFC').replaceAll('’',"'")
    if(engines.some(engine=>engine.correct(normalized)))return {correct:true,suggestions:[]}
    const candidates=engines.map(engine=>engine.suggest(normalized)),suggestions=[]
    // Interleave dictionaries so either spelling convention is easy to choose.
    for(let i=0;i<Math.max(...candidates.map(list=>list.length));i++){
      for(const list of candidates){
        let value=list[i]
        if(!value)continue
        if(word.includes('’'))value=value.replaceAll("'",'’')
        if(value!==word&&!suggestions.includes(value))suggestions.push(value)
      }
    }
    const ranked=suggestions.map(value=>({value,score:distance(normalized.toLowerCase(),value.replaceAll('’',"'").toLowerCase())}))
    return {correct:false,suggestions:ranked.sort((a,b)=>a.score-b.score).slice(0,4).map(item=>item.value)}
  }
}
