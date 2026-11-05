// QA isolation only: published assets are copied; third-party dependencies stay
// linked to the prepared workspace. This is not fresh-install acceptance.
import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const names = ['core', 'renderer', 'runtime', 'plugins', 'web-component', 'creator'];
const id = name => '@za38.03/agent-ui-' + name;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function inventory(root, prefixes) {
  const hashes = {};
  async function visit(file) {
    const stat = await lstat(file);
    if (stat.isSymbolicLink()) throw Error('Published QA assets must not contain symlinks');
    if (stat.isDirectory()) for (const entry of (await readdir(file)).sort()) await visit(path.join(file, entry));
    else if (stat.isFile()) hashes[path.relative(root, file).split(path.sep).join('/')] = digest(await readFile(file));
  }
  for (const prefix of prefixes) await visit(path.join(root, prefix));
  return hashes;
}
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export async function freezePackages(repository, proofFile) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'creator-qa-packages-')));
  const roots = Object.fromEntries(names.map(name => [id(name), path.join(root, name)]));
  const proof = { scope: 'Copied published assets; linked workspace third-party dependencies; not fresh npm installation.', created: new Date().toISOString(), packages: {}, unchanged: null, cleaned: false };
  const save = async () => { if (proofFile) await writeFile(proofFile, JSON.stringify(proof, null, 2)); };
  try {
    for (const name of names) {
      const source = path.join(repository, 'packages', name), destination = roots[id(name)];
      const metadata = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
      // npm files roots are copied wholesale so no glob filtering can omit an
      // imported resource. Creator docs/skills are development-only assets.
      const assets = ['package.json', ...new Set(metadata.files.map(file => file.split('/')[0]))];
      const before = await inventory(source, assets);
      await mkdir(destination, { recursive: true });
      for (const asset of assets) await cp(path.join(source, asset), path.join(destination, asset), { recursive: true });
      const after = await inventory(source, assets), copied = await inventory(destination, assets);
      if (!equal(before, after) || !equal(before, copied)) throw Error('Package changed while snapshotting: ' + name);
      proof.packages[id(name)] = { version: metadata.version, assets, hashes: copied };
    }
    // Override all six workspace links transitively as well as in the Host.
    // Other dependency entries retain their existing resolved identity.
    for (const name of names) {
      const modules = path.join(repository, 'packages', name, 'node_modules');
      const target = path.join(roots[id(name)], 'node_modules');
      await mkdir(target);
      const link = async (source, destination) => {
        const info = await stat(source).catch(() => null);
        if (!info) return;
        await symlink(source, destination, info.isDirectory() ? process.platform === 'win32' ? 'junction' : 'dir' : 'file');
      };
      for (const entry of await readdir(modules)) {
        if (entry !== '@za38.03') await link(path.join(modules, entry), path.join(target, entry));
        else {
          await mkdir(path.join(target, entry));
          for (const child of await readdir(path.join(modules, entry))) {
            const dependency = entry + '/' + child;
            await link(roots[dependency] ?? path.join(modules, entry, child), path.join(target, entry, child));
          }
        }
      }
    }
    await save();
    return { roots, proof, async close() {
      try {
        proof.unchanged = true;
        for (const name of names) {
          const previous = proof.packages[id(name)];
          if (!equal(previous.hashes, await inventory(roots[id(name)], previous.assets))) proof.unchanged = false;
        }
      } finally {
        await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        proof.cleaned = true; await save();
      }
      if (!proof.unchanged) throw Error('Frozen QA assets changed during the run');
    } };
  } catch (error) { await rm(root, { recursive: true, force: true, maxRetries: 5 }); throw error; }
}
