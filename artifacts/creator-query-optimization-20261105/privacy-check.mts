import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostEnvironment } from '../../packages/creator/src/agent/config.js';
const root = fileURLToPath(new URL('.', import.meta.url));
const repository = fileURLToPath(new URL('../../', import.meta.url));
const environment = hostEnvironment(repository);
const secrets = Object.entries(environment).filter(([name, value]) => /API_KEY|AUTH_TOKEN/u.test(name) && typeof value === 'string' && value.length >= 8).map(([, value]) => value as string);
if (!secrets.length) throw Error('No configured credential available for exact-match scan');
let files = 0;
async function scan(directory: string) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await scan(file);
    else if (entry.isFile()) {
      if (entry.name.startsWith('.env') || entry.name === 'creator-records') throw Error('Private configuration must not be archived');
      const bytes = await readFile(file); files++;
      if (secrets.some(secret => bytes.includes(Buffer.from(secret)))) throw Error('Configured credential found in archive');
    } else throw Error('Archive must contain regular files only');
  }
}
await scan(root);
const result = { status: 'passed', files, scope: 'Exact configured API-key/token matches and private configuration filenames only; not a general secret audit.' };
await writeFile(path.join(root, 'privacy-check.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
