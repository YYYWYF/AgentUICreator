import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, realpath, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { spawnPnpmSync } from './pnpm-process.mjs';

const repository = fileURLToPath(new URL('..', import.meta.url));
const directory = path.resolve(process.argv[2]); await mkdir(directory, { recursive: true });
const packageRoots = {}, identities = [], dependencies = new Map();
for (const owner of ['core', 'renderer', 'runtime', 'plugins']) {
  const source = path.join(repository, 'packages', owner), manifest = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
  const archives = path.join(directory, 'archives', owner); await mkdir(archives, { recursive: true });
  const packed = spawnPnpmSync(['pack', '--pack-destination', archives], { cwd: source, encoding: 'utf8', env: { ...process.env, npm_config_ignore_scripts: 'true' } });
  assert.equal(packed.status, 0, packed.stderr);
  const filename = (await readdir(archives)).find(name => name.endsWith('.tgz')); assert(filename);
  const archive = await readFile(path.join(archives, filename)), tar = gunzipSync(archive);
  const target = path.join(directory, 'node_modules', manifest.name); await mkdir(target, { recursive: true });
  let sourceMaps = 0;
  let extendedPath;
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512); if (header.every(byte => byte === 0)) break;
    const field = (a, b) => header.subarray(a, b).toString().split('\0')[0];
    const size = parseInt(field(124, 136).trim(), 8) || 0, prefix = field(345, 500), type = field(156, 157);
    const name = extendedPath ?? [prefix, field(0, 100)].filter(Boolean).join('/'), data = tar.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === 'x') { extendedPath = data.toString().match(/(?:^|\n)\d+ path=([^\n]+)/u)?.[1]; continue; }
    if (type === 'L') { extendedPath = data.toString().replace(/\0.*$/su, ''); continue; }
    extendedPath = undefined; if (type === '5') continue;
    assert(type === '0' || type === '', `Unsupported archive type: ${type}`);
    assert(name.startsWith('package/') && !name.split('/').includes('..'), name);
    if (name.endsWith('.js.map')) {
      const map = JSON.parse(data.toString());
      assert.equal(map.sources?.length, map.sourcesContent?.length, `Published sourcemap must embed its source: ${manifest.name}/${name}`);
      assert(map.sourcesContent.every(source => typeof source === 'string'), `Unavailable sourcemap source: ${manifest.name}/${name}`);
      sourceMaps++;
    }
    const file = path.join(target, ...name.slice('package/'.length).split('/')); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, data);
  }
  packageRoots[manifest.name] = target;
  identities.push({ name: manifest.name, version: manifest.version, tarballSha256: createHash('sha256').update(archive).digest('hex'), sourceMaps });
  for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies })) {
    if (name.startsWith('@za38.03/agent-ui-')) continue;
    try { dependencies.set(name, await realpath(path.join(source, 'node_modules', name))); } catch { }
  }
}
for (const [name, source] of dependencies) {
  const target = path.join(directory, 'node_modules', name); await mkdir(path.dirname(target), { recursive: true });
  await symlink(source, target, process.platform === 'win32' ? 'junction' : 'dir');
}
await writeFile(path.join(directory, 'packages.json'), JSON.stringify({ packageRoots, identities, thirdParty: 'existing exact installed dependencies; no registry install performed' }, null, 2));
process.stdout.write(JSON.stringify({ packageRoots, identities }));
