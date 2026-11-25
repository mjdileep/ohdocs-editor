const wrap = request => new Promise((resolve,reject) => {
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})
export async function openStorage() {
  const request = indexedDB.open('ohdocs-drafts', 1)
  request.onupgradeneeded = () => {
    request.result.createObjectStore('document')
    request.result.createObjectStore('files')
  }
  const db = await wrap(request)
  db.onversionchange = () => db.close()
  return db
}
const fileRange = id => IDBKeyRange.bound([id], [id, []])
export async function listDrafts(db) {
  const docs = await wrap(db.transaction('document').objectStore('document').getAll())
  return docs.map(row => summary(row.id, row, row.updated))
}
export async function readSnapshot(db,id) {
  const tx = db.transaction(['document','files'])
  const range = fileRange(id)
  const [record, keys, blobs] = await Promise.all([wrap(tx.objectStore('document').get(id)),
    wrap(tx.objectStore('files').getAllKeys(range)), wrap(tx.objectStore('files').getAll(range))])
  return {doc:record?.doc, title:record?.title ?? '', updated:record?.updated, rev:record?.rev || 0, files:new Map(keys.map((key,i) => [key[1],blobs[i]]))}
}
export function summary(id, snapshot, updated = Date.now()) {
  const parts = []
  function visit(node) {
    if (node.text) parts.push(node.text)
    else if (node.attrs?.label) parts.push(node.attrs.label)
    node.content?.forEach(visit)
  }
  visit(snapshot.doc)
  const text = parts.join(' ')
  return {id,title:snapshot.title?.trim() || 'Untitled note',text,updated:updated || Date.now(),words:text.trim().split(/\s+/).filter(Boolean).length}
}
export function removeDraft(db, id, rev) {
  return new Promise((resolve,reject) => {
    const tx = db.transaction(['document','files'],'readwrite'), docs = tx.objectStore('document')
    const read = docs.get(id)
    read.onsuccess = () => {
      if ((read.result?.rev || 0) !== rev) { tx.abort(); return }
      docs.delete(id); tx.objectStore('files').delete(fileRange(id))
    }
    tx.oncomplete = resolve
    tx.onabort = () => reject(tx.error || new Error('This note changed in another tab. Reload before deleting it.'))
  })
}
// Commit document and files together. A second tab cannot overwrite newer edits.
export function writeSnapshot(db, id, snapshot, previous, replaceFiles = false) {
  return new Promise((resolve,reject) => {
    const tx = db.transaction(['document','files'],'readwrite')
    const docs = tx.objectStore('document'), files = tx.objectStore('files')
    let reason
    const get = docs.get(id)
    get.onsuccess = () => {
      if ((get.result?.rev || 0) !== previous.rev) reason = 'Changed in another tab. Download your edits or reload.'
      if (reason) { tx.abort(); return }
      for (const key of previous.ids) if (!snapshot.files.has(key)) files.delete([id,key])
      for (const [key, file] of snapshot.files) if (replaceFiles || !previous.ids.has(key)) files.put(file,[id,key])
      docs.put({id,title:snapshot.title,updated:Date.now(),doc:snapshot.doc,rev:previous.rev+1},id)
    }
    tx.oncomplete = () => resolve({rev:previous.rev+1,ids:new Set(snapshot.files.keys())})
    tx.onabort = () => reject(reason ? new Error(reason) : tx.error || new Error('Local save failed.'))
  })
}
export async function exportFile(snapshot) {
  const files = await Promise.all([...snapshot.files].map(async ([id,file]) => {
    const reader = new FileReader(), data = new Promise((resolve,reject) => {
      reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = () => reject(reader.error)
    })
    reader.readAsDataURL(file)
    return {id,name:file.name,type:file.type,data:await data}
  }))
  return new Blob([JSON.stringify({format:'ohdocs-playground',version:1,title:snapshot.title || '',doc:snapshot.doc,files})],{type:'application/json'})
}
export function importFile(raw) {
  if (raw?.format !== 'ohdocs-playground' || raw.version !== 1 || raw.doc?.type !== 'doc' || !Array.isArray(raw.doc.content) || !Array.isArray(raw.files)) throw new Error('Choose an OhDocs document downloaded from the playground.')
  const files = new Map()
  for (const {id,name,type,data} of raw.files) {
    if (typeof id !== 'string' || files.has(id) || typeof data !== 'string') throw new Error('Invalid attachment.')
    files.set(id,new File([Uint8Array.from(atob(data), c => c.charCodeAt(0))],name || 'File',{type:type || 'application/octet-stream'}))
  }
  return {title:typeof raw.title === 'string' ? raw.title : '',doc:raw.doc, files}
}
