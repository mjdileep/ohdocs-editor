const text = (value, ...marks) => ({type:'text', text:value, ...(marks.length ? {marks} : {})})
const mark = (type, attrs) => attrs ? {type, attrs} : {type}
const inline = parts => parts.map(part => typeof part === 'string' ? text(part) : part)
const p = (...parts) => ({type:'paragraph', content:inline(parts)})
const h = (level, label) => ({type:'heading', attrs:{level}, content:[text(label)]})
const task = (checked, label) => ({type:'taskItem', attrs:{checked}, content:[p(label)]})
const list = (type, ...lines) => ({type, content:lines.map(line => ({type:'listItem',content:[p(line)]}))})
const details = (label, ...content) => ({type:'details', attrs:{open:false}, content:[
  {type:'detailsSummary',content:[text(label)]}, {type:'detailsContent',content}
]})
const object = attrs => ({type:'previewAttachment', attrs:{documentFlow:true, ...attrs}})
const code = (language, value) => ({type:'codeBlock', attrs:{language,documentFlow:true}, content:[text(value)]})
const link = (label, href) => text(label, mark('link',{href}))
const tableRow = (header, ...values) => ({type:'tableRow', content:values.map((value, column) => ({
  type:header ? 'tableHeader' : 'tableCell',
  attrs:{backgroundColor:header ? '#dcefe5' : column === 2 ? '#fff3cc' : null},
  content:[p(value)]
}))})

export { text, mark, p, h, task, list, details, object, code, link, tableRow }
