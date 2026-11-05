import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, 'record-manifest.json'), 'utf8'));
const actual = new Set();
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw Error('Archive must not depend on symbolic links');
    if (entry.isDirectory()) await walk(file);
    else if (entry.isFile()) actual.add(path.relative(root, file).split(path.sep).join('/'));
  }
}
await walk(root);
actual.delete('record-manifest.json');
for (const [relative, expected] of Object.entries(manifest)) {
  if (!relative || /[\\:\x00]/u.test(relative) || relative.startsWith('/') || relative.split('/').includes('..')) throw Error('Invalid archive path');
  const hash = createHash('sha256').update(await readFile(path.join(root, ...relative.split('/')))).digest('hex');
  if (hash !== expected) throw Error(`Archive hash mismatch: ${relative}`);
  if (!actual.delete(relative)) throw Error(`Archive entry missing: ${relative}`);
}
if (actual.size) throw Error(`Unlisted archive files: ${[...actual].join(', ')}`);
console.log(JSON.stringify({ status: 'passed', files: Object.keys(manifest).length, scope: 'Archive hashes and file inventory only. No model, browser or platform acceptance.' }));
