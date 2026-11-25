import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../site/', import.meta.url))
const types = {'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.txt':'text/plain'}
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url,'http://localhost').pathname)
    const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname))
    if (!file.startsWith(resolve(root) + sep)) throw new Error()
    const bytes = await readFile(file)
    response.writeHead(200, {'content-type':types[extname(file)] || 'application/octet-stream'}).end(bytes)
  } catch { response.writeHead(404).end() }
}).listen(Number(process.env.PORT || 4173),'127.0.0.1',function () {
  console.log('OhDocs playground at http://127.0.0.1:' + this.address().port)
})
