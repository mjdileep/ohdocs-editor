// The guide is a normal editable document. Both example files travel with it in exports.
export const guideId = 'ohdocs-editor-guide'
const guideTitle = 'A field guide to OhDocs'
const imageId = 'guide-planting-plan', fileId = 'guide-seed-count'

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

const guide = {type:'doc', content:[
  p('Plan a little pollinator garden while you try the editor. Everything on this page is editable. Start by ticking the last box or changing the planting plan.'),
  {type:'taskList', content:[task(true,'Find a sunny patch.'),task(true,'Leave a path to the water tap.'),task(false,'Choose a flower for the last bed.')]},
  h(2,'Lay out the beds'),
  object({fileId:imageId, label:'Planting plan with three raised beds and a path', width:440}),
  p('Select the plan to crop it, rotate it or adjust its colors. Drag a corner to scale it, or a side to stretch it. Choose left or right placement to wrap text around it.'),
  {type:'table',attrs:{documentFlow:true},content:[
    tableRow(true,'Bed','What to plant','Seedlings'),
    tableRow(false,'A','Lavender','6'),tableRow(false,'B','Cosmos','8'),tableRow(false,'C','Calendula','4')
  ]},
  p('Click a cell and try a fill color for the cell, row or column. Right-click for row and column actions. Drag the table by its edge.'),
  h(2,'Leave a field note'),
  p('Select any words to try ',text('bold',mark('bold')),', ',text('italic',mark('italic')),', ',text('underline',mark('underline')),' or ',text('strikethrough',mark('strike')),'. Try changing ',text('this ink',mark('textStyle',{color:'#086a50'})),' or ',text('this highlight',mark('highlight',{color:'#ffe797'})),'.'),
  p(text('Full sun',mark('textStyle',{fontSize:'18pt',color:'#70491c'})),{type:'hardBreak'},'Six or more hours of direct sunlight. The label above has a custom font size.'),
  {type:'blockquote',content:[p('“Leave enough room to kneel beside each bed.”')]},
  details('Try text styles, outlines and spelling',
    p('Use Aa to switch between body text and six heading levels. Select a passage to change or clear its formatting.'),
    ...['Garden notebook','Spring planting','The south bed','Week one','First shoots','Morning reading'].map((label,i) => h(i+1,label)),
    p('A plant label in inline code looks like ',text('bed_A',mark('code')),'. Scientific notes can include H',text('2',mark('subscript')),'O and m',text('2',mark('superscript')),'.'),
    p('Right-click ',text('recieve',mark('italic')),' to try an English spelling suggestion. Undo and redo from the toolbar or with your usual keyboard shortcuts.')),
  h(2,'Make a field sketch'),
  object({label:'Seedling sketch', width:114, drawing:{width:114,height:70,size:3,color:'#207956',opacity:1,points:[[56,64],[56,48],[54,38],[46,27],[31,23],[19,24],[28,35],[39,40],[53,41],[57,35],[66,23],[77,14],[94,10],[91,21],[82,32],[69,37],[58,39],[56,47],[56,64]]}}),
  p('Select the sprout and move it with the arrow keys. Hold Shift for bigger steps. Right-click to duplicate it or change its layer. You can also download the drawing as a transparent PNG.'),
  p('To draw next to it, open Insert (+) and choose Draw on page. Try the pen or highlighter, or sketch a rough shape and pause. Choose the suggested shape or keep your sketch. The drawing toolbar also has lines, arrows, shapes, colors, stroke widths and an eraser.'),
  {type:'horizontalRule'},
  h(2,'Keep the working material together'),
  p('The seed count is attached as a small CSV. Drop your own file or image onto the page, paste an image, or use the paperclip.'),
  object({fileId, label:'seed-count.csv', detail:'CSV · 3 beds'}),
  p('This JavaScript adds up the last column. Use the copy button to get the exact code. The language menu also offers automatic detection. Drag the code block by its header.'),
  code('javascript','const seedlings = [6, 8, 4]\nconst total = seedlings.reduce((sum, count) => sum + count, 0)\nconsole.log(total)  // 18'),
  p('With ',{type:'inlineMath',attrs:{latex:'n = 3'}},' beds, the average is six seedlings per bed.',{type:'footnoteReference',attrs:{label:'seed-count'}}),
  {type:'blockMath',attrs:{latex:'\\bar{x} = \\frac{6 + 8 + 4}{3} = 6'}},
  p('Click an equation to edit its LaTeX.'),
  details('Watch a flower in motion',
    p('Press Play to load the flower clip from MDN. Insert (+) also accepts YouTube, Vimeo and direct video links. Drag the video to move it. Double-click to use its player controls.'),
    object({videoSource:'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',label:'Flowers in the breeze',width:400})),
  h(2,'Try a Markdown paste'),
  p('Copy the block below, then paste into the empty paragraph at the end of the note. The heading, checklist and emphasis will become editable. You can also choose Insert Markdown from the + menu.'),
  code('markdown','## Next visit\n\n- [ ] Water the **new seedlings**\n- [ ] Photograph the first flower'),
  details('Lists, links and keyboard moves',
    list('bulletList','Mulch for the path','Labels for each row'),
    list('orderedList','Loosen the soil.','Plant the seedlings.','Water at the roots.'),
    p('Type / at the start of a paragraph to insert a block. When moving objects, use the alignment guides to line them up. On a narrow screen, the page stacks objects for reading.'),
    p('Copy, cut, paste or delete a selected object. Press Escape to return to text. Click a divider to select and remove it.'),
    p('This is a web link to the ',link('OhDocs Editor quick start','https://github.com/mjdileep/ohdocs-editor#quick-start'),'. Use the chain icon to edit a link or add your own.')),
  h(2,'Take the notebook with you'),
  p('Use the pencil beside All notes to start a blank note. Search the list, switch to gallery view, sort by title, or expand the page for focused writing.'),
  p('Notes and attachments are saved in this browser. Choose Note options (…) → Download note to keep a copy. On another device, choose Import a note to open it. Clearing site data removes the local notebook.'),
  p('For business inquiries about the editor, contact ',link('@doubledescent0 on X','https://x.com/doubledescent0'),'.'),
  {type:'footnoteDefinition',attrs:{label:'seed-count'},content:[p('Seed counts come from the three rows in the planting table.')]},
  p()
]}

// A self-contained image and CSV keep the examples usable on first open and after export.
const plantingPlan = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="200" viewBox="0 0 720 200" role="img" aria-label="Three planted beds beside a gravel path">
<defs><pattern id="soil" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1" fill="#c8ab83"/></pattern>
<g id="lav"><path d="M0 14Q-4 0 0-14M0 13Q5 1 8-10" fill="none" stroke="#506650" stroke-width="2"/><g fill="#8c78a7"><ellipse cy="-9" rx="3" ry="7"/><ellipse cx="7" cy="-6" rx="3" ry="6" transform="rotate(15 7 -6)"/></g></g>
<g id="flower"><g fill="currentColor"><ellipse cy="-6" rx="4" ry="7"/><ellipse cx="6" cy="-2" rx="7" ry="4"/><ellipse cx="4" cy="5" rx="5" ry="6"/><ellipse cx="-4" cy="5" rx="5" ry="6"/><ellipse cx="-6" cy="-2" rx="7" ry="4"/></g><circle r="4" fill="#885f26"/></g></defs>
<rect width="720" height="200" rx="12" fill="#f3f1e5"/><path d="M24 151H696" stroke="#c7bea7" stroke-width="15" stroke-linecap="round"/><path d="M24 151H696" stroke="#ede5cc" stroke-width="2" stroke-dasharray="5 8"/>
${['A · Lavender','B · Cosmos','C · Calendula'].map((label,i) => {
  const plants = [6,8,4][i], perRow = plants/2
  return `<g transform="translate(${28+i*229},18)"><rect width="204" height="111" rx="9" fill="#ddc7a7" stroke="#ad9372" stroke-width="2"/><rect width="204" height="111" rx="9" fill="url(#soil)"/>${Array.from({length:plants},(_,n) => `<use href="#${i ? 'flower':'lav'}" transform="translate(${(n%perRow+.5)*204/perRow} ${34+Math.floor(n/perRow)*43})" color="${i===1?'#d187a0':'#e8aa47'}"/>`).join('')}<text x="102" y="165" text-anchor="middle" font-family="system-ui,sans-serif" font-size="16" font-weight="600" fill="#3a483d">${label}</text></g>`
}).join('')}</svg>`

export function createGuide() {
  const files = new Map([
    [imageId,new File([plantingPlan],'planting-plan.svg',{type:'image/svg+xml'})],
    [fileId,new File(['bed,plant,seedlings\nA,Lavender,6\nB,Cosmos,8\nC,Calendula,4\n'],'seed-count.csv',{type:'text/csv'})]
  ])
  return {title:guideTitle, doc:structuredClone(guide), files}
}
