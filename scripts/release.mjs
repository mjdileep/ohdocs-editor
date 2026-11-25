// Helpers for apps that package self-contained releases.
//
// An app's browser bundles already contain the editor. Its server may also run
// the editor's document format code (validation and read-only rendering), so a
// release carries its own copy of format/ under editor/, next to server/. The
// server installs packages from the app's own lockfile, so every package the
// format code imports must be an app dependency at exactly the editor's version.
import { readFile, readdir, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Static imports and re-exports at the start of a line, and dynamic import('...').
const importPatterns = [
  /^\s*(?:import|export)\s[^;]*?\bfrom\s*['"]([^'"]+)['"]/gm,
  /^\s*import\s*['"]([^'"]+)['"]/gm,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
];
const packageName = specifier => specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
const isBuiltin = specifier => specifier.startsWith('node:') || builtinModules.includes(packageName(specifier));

export async function specifiersIn(file) {
  const source = await readFile(file, 'utf8');
  return importPatterns.flatMap(pattern => [...source.matchAll(pattern)].map(match => match[1]));
}

// Which editor a release was built with: recorded in every release.json.
export async function editorInfo() {
  const editorPackage = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
  const lockfile = await readFile(resolve(packageRoot, 'package-lock.json'));
  return { name: editorPackage.name, version: editorPackage.version, lockfileSha256: createHash('sha256').update(lockfile).digest('hex') };
}

// Copy the server-side editor files into <stage>/editor and describe them.
export async function stageEditor({ appDir, stageDir }) {
  const editorPackage = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
  const appPackage = JSON.parse(await readFile(resolve(appDir, 'package.json'), 'utf8'));
  const files = (await readdir(resolve(packageRoot, 'format'))).filter(name => name.endsWith('.mjs') && !name.endsWith('.test.mjs')).sort();
  const problems = [];
  for (const name of files) for (const specifier of await specifiersIn(resolve(packageRoot, 'format', name))) {
    if (specifier.startsWith('.') || isBuiltin(specifier)) continue;
    const dependency = packageName(specifier), wanted = editorPackage.dependencies?.[dependency], installed = appPackage.dependencies?.[dependency];
    if (!wanted) problems.push(`format/${name} imports ${dependency}, which the editor package does not declare`);
    else if (installed !== wanted) problems.push(`${appPackage.name} needs "${dependency}": "${wanted}" in dependencies (has ${installed ? `"${installed}"` : 'none'}); format/${name} runs on its server`);
  }
  if (problems.length) throw new Error('Editor format dependencies do not match:\n- ' + [...new Set(problems)].join('\n- '));
  await mkdir(resolve(stageDir, 'editor/format'), { recursive: true });
  for (const name of files) await copyFile(resolve(packageRoot, 'format', name), resolve(stageDir, 'editor/format', name));
  await writeFile(resolve(stageDir, 'editor/package.json'), JSON.stringify({ name: editorPackage.name, version: editorPackage.version, private: true, type: 'module' }, null, 2) + '\n');
  return editorInfo();
}

// Every relative import must stay inside the release, and every package import
// must be a production dependency of the app (development ones are not installed).
// `paths` are folders or single files inside the stage: only what the server runs.
export async function checkContained({ stageDir, appPackage, paths }) {
  const problems = [];
  const checkFile = async full => {
    for (const specifier of await specifiersIn(full)) {
      if (specifier.startsWith('.')) {
        const target = resolve(dirname(full), specifier);
        if (!target.startsWith(stageDir + sep) || !existsSync(target)) problems.push(`${relative(stageDir, full)} imports ${specifier}, which is not in the release`);
      } else if (!isBuiltin(specifier) && !appPackage.dependencies?.[packageName(specifier)]) {
        problems.push(`${relative(stageDir, full)} imports ${packageName(specifier)}, which is not a production dependency`);
      }
    }
  };
  const visit = async path => {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const full = resolve(path, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (/\.m?js$/.test(entry.name)) await checkFile(full);
    }
  };
  for (const path of paths.map(path => resolve(stageDir, path))) {
    if (!existsSync(path)) problems.push(`${relative(stageDir, path)} is missing`);
    else if (/\.m?js$/.test(path)) await checkFile(path);
    else await visit(path);
  }
  if (problems.length) throw new Error('Release is not self-contained:\n- ' + [...new Set(problems)].join('\n- '));
}

export function gitCommit(cwd) {
  try {
    const commit = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' }).trim() !== '';
    return dirty ? commit + '-dirty' : commit;
  } catch { return 'unknown'; }
}
