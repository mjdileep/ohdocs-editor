import { build } from 'esbuild'
import { mkdir, readdir, readFile, writeFile, cp } from 'node:fs/promises'
import { resolve, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const dist = resolve(root, 'dist')
await mkdir(dist, {recursive:true})
const result = await build({
  absWorkingDir:root, entryPoints:{index:'src/standalone.js','spelling-worker':'src/spelling-worker.js',editor:'styles/standalone.css'},
  outdir:dist, bundle:true, minify:true, format:'esm', platform:'browser', target:'es2022',
  legalComments:'eof', loader:{'.dic':'text','.aff':'text'}, metafile:true
})

// Retain the actual license texts for every dependency included in these browser bundles.
const used = new Set(['lucide-static'])
for (const input of Object.keys(result.metafile.inputs)) {
  const subpath = input.split('node_modules/').at(-1)
  if (subpath === input) continue
  const names = subpath.split('/')
  used.add(names.slice(0, names[0].startsWith('@') ? 2 : 1).join('/'))
}
const notices = []
for (const name of [...used].sort()) {
  const folder = resolve(root, 'node_modules', name)
  const manifest = JSON.parse(await readFile(join(folder,'package.json'),'utf8'))
  const filenames = (await readdir(folder)).filter(file => /^(licen[cs]e|copying|notice)([.-]|$)/i.test(file)).sort()
  if (!filenames.length) throw new Error('Missing third-party notice for ' + name)
  notices.push(name + ' ' + manifest.version, ...await Promise.all(filenames.map(file => readFile(join(folder,file),'utf8'))))
}
await writeFile(join(dist,'THIRD-PARTY-NOTICES.txt'), notices.join('\n\n'))
// The downloadable static site is built from exactly the same assets as the library.
const site = resolve(root,'site')
await mkdir(site, {recursive:true})
await cp(resolve(root,'demo'),site,{recursive:true,filter:path => basename(path) !== 'serve.mjs'})
await cp(dist,join(site,'editor'),{recursive:true})
await cp(join(root,'LICENSE'), join(site,'LICENSE.txt'))

