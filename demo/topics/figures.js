import { p, text, mark, link, object, tableRow } from '../document-nodes.js'

export const image = (fileId, label, width = 600) => object({fileId, label, width})
export const video = (id, label) => object({videoSource:'https://www.youtube.com/watch?v=' + id, label, width:560})
export const caption = (...parts) => p(...parts.map(part => typeof part === 'string' ? text(part, mark('italic')) : part))
export const table = (head, ...rows) => ({type:'table', attrs:{documentFlow:true}, content:[tableRow(true,...head), ...rows.map(row => tableRow(false,...row))]})
export const credit = (name, page, license, licenseUrl) => caption('Photo by ',link(name,page),' · ',link(license,licenseUrl),'. Resized and compressed for this note.')
export const file = (id, name, type, contents) => [id, new File([contents], name, {type})]
