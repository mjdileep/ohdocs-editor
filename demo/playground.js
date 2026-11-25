import { createEditor, icon, isNewerFormat } from './editor/index.js'
import { openStorage, readSnapshot, writeSnapshot, removeDraft, exportFile, importFile, listDrafts, summary, ensureSample } from './storage.js'
import { createGuide, guideId } from './sample.js'
import { topics } from './topics.js'

const samples = new Map([[guideId,createGuide], ...topics])

const get = id => document.getElementById(id)
const blank = () => ({title:'',doc:{type:'doc',content:[{type:'paragraph'}]},files:new Map()})
let db, mounted, original, title, meta, saveLabel, current, saved, pending, writing, dirty, busy
let byTitle = false
const notes = new Map()
function glyphs(root) {
  for (const el of root.querySelectorAll('i[data-icon]')) el.innerHTML = icon(el.dataset.icon)
}
glyphs(document)
function status(value, long = value) {
  saveLabel.textContent = value
  saveLabel.title = long
  saveLabel.setAttribute('aria-label',long)
}
const shortDate = time => new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'}).format(time)
function list() {
  const query = get('search').value.trim().toLocaleLowerCase()
  const rows = [...notes.values()].filter(n => (n.title + ' ' + n.text).toLocaleLowerCase().includes(query))
  rows.sort((a,b) => byTitle ? a.title.localeCompare(b.title) : b.updated-a.updated)
  const nav = get('drafts')
  nav.replaceChildren()
  get('count').textContent = rows.length + (rows.length === 1 ? ' note' : ' notes')
  for (const note of rows) {
    const row = document.createElement('button'), label = document.createElement('strong'), detail = document.createElement('small')
    label.textContent = note.title; detail.textContent = shortDate(note.updated) + (note.text ? ' · ' + note.text.slice(0,100) : '')
    row.type = 'button'; row.dataset.id = note.id
    if (note.id === current) row.setAttribute('aria-current','true')
    row.append(label,detail); nav.append(row)
  }
  if (!rows.length) nav.textContent = query ? 'No matching notes' : 'No notes'
}
function snapshot() {
  return mounted.editor.isEditable ? {...mounted.snapshot(),title:title.value} : original
}
function describe(row) {
  get('download-copy').title = 'Download a copy of “' + row.title + '”'
  meta.textContent = 'Edited ' + new Date(row.updated).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) + ' · ' + row.words + (row.words === 1 ? ' word' : ' words')
}
async function flush() {
  while (pending) {
    const next = pending
    pending = null
    try {
      saved = await writeSnapshot(db,current,next,saved)
      if (!pending) { dirty = false; status('Saved','Saved in this browser') }
    } catch (error) {
      pending = null
      status('Unsaved',error.message)
      meta.textContent = error.message.includes('another tab') ? error.message : 'Couldn’t save in this browser. Download a copy to keep your edits.'
      break
    }
  }
}
function changed() {
  const content = snapshot(), row = summary(current,content)
  notes.set(current,row); describe(row); list()
  dirty = true
  if (!db) { status('Unsaved','Browser storage unavailable. Download to keep your edits.'); return }
  pending = content; status('Saving…')
  if (!writing) writing = flush().finally(() => { writing = null })
}
function growTitle() { title.style.height = 'auto'; title.style.height = title.scrollHeight + 'px' }
function mount(id, content) {
  mounted?.destroy()
  current = id; original = content; dirty = false; pending = null
  saved = {rev:content.rev || 0,ids:new Set(content.files.keys())}
  const host = get('document')
  mounted = createEditor(host,{content:content.doc,files:content.files,videoPreviews:true,onChange:changed})
  const bar = host.querySelector('.fn-formatbar'), chrome = document.createElement('header')
  chrome.className = 'note-chrome'
  chrome.append(get('chrome').content.cloneNode(true))
  glyphs(chrome)
  bar.before(chrome); chrome.insertBefore(bar,chrome.querySelector('.save'))
  saveLabel = chrome.querySelector('.save')
  chrome.querySelector('.mobile-download').onclick = downloadCopy
  get('download-copy').disabled = false
  chrome.querySelector('.back').onclick = () => { document.body.classList.add('show-list'); get('search').focus() }
  chrome.querySelector('.focus').onclick = event => {
    const focused = document.body.classList.toggle('focus-mode')
    event.currentTarget.setAttribute('aria-pressed',String(focused))
    event.currentTarget.setAttribute('aria-label',focused ? 'Exit focus mode' : 'Focus on this page')
  }
  title = document.createElement('textarea'); title.className = 'note-title'; title.rows = 1; title.placeholder = 'Title'; title.setAttribute('aria-label','Note title')
  title.value = content.title ?? ''; title.readOnly = !mounted.editor.isEditable
  title.oninput = () => { growTitle(); changed() }
  title.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); mounted.editor.commands.focus('start') } }
  meta = document.createElement('div'); meta.className = 'note-meta'
  host.querySelector('.oh-page').prepend(meta,title)
  const row = summary(id,content,content.updated)
  notes.set(id,row); list(); describe(row)
  requestAnimationFrame(growTitle)
  status(!mounted.editor.isEditable ? 'Read only' : db ? 'Saved' : 'Unsaved',db ? 'Saved in this browser' : 'Browser storage unavailable. Download to keep your edits.')
  window.history.replaceState(null,'',location.pathname+'#'+id)
  if (db && !saved.rev) changed()
}
async function transition(work) {
  if (busy) return
  busy = true
  get('note-menu').hidePopover()
  get('document').inert = true
  try {
    if (writing) await writing
    if (dirty && !confirm('Leave unsaved edits? Download a copy first to keep them.')) return
    await work()
    document.body.classList.remove('show-list')
  } catch (error) { if (meta) meta.textContent = error.message }
  finally { busy = false; get('document').inert = false }
}
async function select(id) {
  if (id === current) { document.body.classList.remove('show-list'); requestAnimationFrame(growTitle); return }
  return transition(async () => {
    const stored = db ? await readSnapshot(db,id) : samples.get(id)()
    if (!stored.doc) throw new Error('This note was deleted in another tab.')
    mount(id,stored)
  })
}
get('drafts').onclick = event => { const id = event.target.closest('button')?.dataset.id; if (id) select(id) }
get('search').oninput = list
get('gallery').onclick = event => event.currentTarget.setAttribute('aria-pressed',String(get('drafts').classList.toggle('grid')))
get('sort').onclick = event => { byTitle = !byTitle; event.currentTarget.setAttribute('aria-pressed',String(byTitle)); list() }
get('new').onclick = () => transition(() => { get('search').value = ''; mount(crypto.randomUUID(),blank()); requestAnimationFrame(() => title.focus()) })
get('guide').onclick = () => transition(async () => {
  if (current === guideId) return
  get('search').value = ''
  if (db) {
    await ensureSample(db,guideId,createGuide,{requested:true})
    mount(guideId,await readSnapshot(db,guideId))
  } else mount(guideId,createGuide())
})
get('reset').onclick = () => transition(async () => {
  const makeSample = samples.get(current) || createGuide
  const next = makeSample()
  if (!confirm('Replace this note and its files with a fresh copy of “' + next.title + '”?')) return
  if (db) { const written = await writeSnapshot(db,current,next,saved,true); next.rev = written.rev }
  mount(current,next)
})
get('delete').onclick = () => transition(async () => {
  if (!confirm('Permanently delete this note and its attachments from this browser?')) return
  await removeDraft(db,current,saved.rev); notes.delete(current)
  const next = notes.keys().next().value
  if (next) mount(next,await readSnapshot(db,next))
  else mount(crypto.randomUUID(),blank())
})
get('open').onclick = () => { get('note-menu').hidePopover(); get('source').click() }
get('source').onchange = async event => {
  const file = event.target.files[0]; event.target.value = ''
  if (!file) return
  try {
    const imported = importFile(JSON.parse(await file.text()))
    if (!isNewerFormat(imported.doc)) mounted.editor.schema.nodeFromJSON(imported.doc).check()
    await transition(() => { get('search').value = ''; mount(crypto.randomUUID(),imported) })
  } catch (error) { meta.textContent = 'Couldn’t open file. ' + error.message }
}
async function downloadCopy() {
  get('note-menu').hidePopover()
  try {
    const content = snapshot(), url = URL.createObjectURL(await exportFile(content))
    const a = document.createElement('a'); a.href = url
    const name = (content.title || '').replace(/[^\p{L}\p{N} _.-]/gu,'').slice(0,80).trim().replace(/^\.+/, '')
    a.download = (name || 'document') + '.ohdocs'
    a.click(); setTimeout(() => URL.revokeObjectURL(url),30000)
  } catch { meta.textContent = 'Download failed. Try again.' }
}
get('download').onclick = downloadCopy
get('download-copy').onclick = downloadCopy
window.addEventListener('beforeunload',event => { if (dirty) { event.preventDefault(); event.returnValue = '' } })
window.addEventListener('resize',() => { if (title) growTitle() })
let initialId, initial
const requested = location.hash.slice(1)
try {
  db = await openStorage()
  await ensureSample(db,guideId,createGuide)
  const existing = await listDrafts(db)
  // Keep the guide first on a fresh install and personal writing ahead of new samples.
  const oldest = existing.reduce((time,row) => Math.min(time,row.updated),Date.now())
  await Promise.all([...topics].map(([id,create],i) => ensureSample(db,id,create,{
    updated:oldest-i-1,
  })))
  const rows = await listDrafts(db)
  for (const row of rows) notes.set(row.id,row)
  initialId = notes.has(requested) ? requested : rows.sort((a,b) => b.updated-a.updated)[0]?.id
  if (initialId) initial = await readSnapshot(db,initialId)
} catch {
  db = null
  for (const [id,create] of samples) notes.set(id,summary(id,create()))
  initialId = samples.has(requested) ? requested : guideId
  initial = samples.get(initialId)()
}
mount(initialId || crypto.randomUUID(),initial || blank())
get('new').disabled = !db; get('delete').disabled = !db
