// The editor draws Lucide icons from a generated map instead of shipping all of
// them. collectIcons() keeps only the icons a bundle can name: every quoted
// kebab-case string in the given source folders that matches an icon file.
//
// Each app calls collectIcons() with its own folders plus the editor's, writes
// the result inside the app, and points the editor's `./.build/icons.json`
// import at it while bundling (see iconsPlugin). Run this file directly to write
// the editor's own set to src/.build/icons.json for its tests.
import { readdir, readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lucide = resolve(dirname(createRequire(import.meta.url).resolve('lucide-static/package.json')), 'icons');

export const editorSourceFolders = [resolve(packageRoot, 'src'), resolve(packageRoot, 'format')];

export async function collectIcons(folders) {
  let sources = '';
  for (const folder of folders) for (const name of await readdir(folder)) if (/\.(mjs|js|html)$/.test(name)) sources += await readFile(resolve(folder, name), 'utf8');
  const tokens = new Set([...sources.matchAll(/['"]([a-z][a-z0-9-]*)['"]/g)].map(match => match[1]));
  // Sorted, so the same sources give the same bundle on every operating system.
  const names = (await readdir(lucide)).filter(name => name.endsWith('.svg') && tokens.has(name.slice(0, -4))).sort();
  const icons = {};
  for (const name of names) icons[name.slice(0, -4)] = (await readFile(resolve(lucide, name), 'utf8')).replace('<svg', '<svg aria-hidden="true" focusable="false"');
  return icons;
}

// esbuild plugin: serve the app's icon map wherever the editor imports its own.
export async function iconsPlugin(iconsFile) {
  const editorIcons = await realpath(resolve(packageRoot, 'src/icons.js'));
  return {
    name: 'editor-icons',
    setup(build) {
      build.onResolve({ filter: /^\.\/\.build\/icons\.json$/ }, async args => (await realpath(args.importer).catch(() => args.importer)) === editorIcons ? { path: iconsFile } : undefined);
    },
  };
}

export const lucideLicense = resolve(lucide, '..', 'LICENSE');

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = resolve(packageRoot, 'src/.build/icons.json');
  await mkdir(dirname(out), { recursive: true });
  const icons = await collectIcons([...editorSourceFolders, resolve(packageRoot, 'demo')]);
  await writeFile(out, JSON.stringify(icons));
  process.stdout.write(`Wrote ${Object.keys(icons).length} editor icons.\n`);
}
