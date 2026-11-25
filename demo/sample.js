const text = value => ({type:'text', text:value})
const paragraph = value => ({type:'paragraph', content:[text(value)]})
const heading = (level, value) => ({type:'heading', attrs:{level}, content:[text(value)]})
const task = (checked, value) => ({type:'taskItem', attrs:{checked}, content:[paragraph(value)]})
const row = (cells, header = false) => ({type:'tableRow', content:cells.map(value => ({type:header ? 'tableHeader' : 'tableCell', content:[paragraph(value)]}))})

export const sample = {type:'doc', content:[
  paragraph('An early train, a picnic on the headland, and a whole afternoon with nowhere to be.'),
  {type:'blockquote', content:[paragraph('Make this page yours. Drop in a photo, paste some Markdown, or type / to sketch a route.')]},
  heading(2, 'The loose itinerary'),
  {type:'table', content:[row(['When','The plan'], true),row(['Saturday morning','Catch the coastal train']),row(['Saturday afternoon','Walk to the lighthouse']),row(['Sunday','Find a café and write postcards'])]},
  heading(2, 'Before we go'),
  {type:'taskList', content:[task(true,'Book the train'),task(false,'Pack a sketchbook and a pencil'),task(false,'Download the trail map')]},
  {type:'paragraph'}
]}
