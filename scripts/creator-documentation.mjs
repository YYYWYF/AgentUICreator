import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, mkdir, rm, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnPnpmSync } from './pnpm-process.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const hash = data => createHash('sha256').update(data).digest('hex');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const modules = ['core', 'renderer', 'runtime', 'plugins', 'web-component', 'creator'];
const skipped = new Set(['node_modules', 'doc_build', '.rspress', '.git']);
const resourceExtensions = new Set(['.md', '.txt', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif']);

export function isDocumentationResource(name) {
  const extension = path.posix.extname(name).toLowerCase();
  return extension === '.txt'
    ? name === 'llms.txt' || name === 'llms-full.txt'
    : resourceExtensions.has(extension);
}

// Artifact paths are POSIX identifiers, regardless of the build host platform.
export function logicalPath(root, file, paths = path) {
  return paths.relative(root, file).split(paths.sep).join('/');
}

export function artifactPath(root, name) {
  assert(typeof name === 'string' && name.length > 0, 'Empty documentation path');
  assert(!name.includes('\\') && !name.includes(':') && !name.startsWith('/'), 'Invalid documentation path');
  assert(name.split('/').every(part => part && part !== '.' && part !== '..'), 'Invalid documentation path');
  return path.join(root, ...name.split('/'));
}

async function filesUnder(root, skip = new Set()) {
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const file = path.join(directory, entry.name);
      assert(!entry.isSymbolicLink(), `Documentation must not contain symlinks: ${file}`);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) files.push(logicalPath(root, file));
    }
  }
  await visit(root);
  return files.sort(compare);
}

async function sourceIdentity(root) {
  const versions = {};
  const inputs = ['pnpm-lock.yaml', 'scripts/creator-documentation.mjs'];
  for (const module of modules) {
    const name = `packages/${module}/package.json`;
    const manifest = JSON.parse(await readFile(artifactPath(root, name), 'utf8'));
    versions[manifest.name] = manifest.version;
    inputs.push(name);
  }
  for (const name of await filesUnder(path.join(root, 'website'), skipped)) inputs.push(`website/${name}`);
  const records = [];
  for (const name of inputs.sort(compare)) records.push([name, hash(await readFile(artifactPath(root, name)))]);
  return { versions, sourceDigest: hash(JSON.stringify(records)) };
}

// Also usable against an extracted npm tarball with no repository present.
export async function verifyDocumentation(directory, expected = {}) {
  const index = JSON.parse(await readFile(path.join(directory, 'index.json'), 'utf8'));
  assert.equal(index.schemaVersion, 1);
  assert.equal(index.packageName, '@za38.03/agent-ui-creator');
  assert.equal(index.packageVersion, index.versions[index.packageName]);
  assert.match(index.sourceDigest, /^[a-f0-9]{64}$/u);
  if (expected.version) assert.equal(index.packageVersion, expected.version, 'Documentation version is stale');
  if (expected.sourceDigest) assert.equal(index.sourceDigest, expected.sourceDigest, 'Documentation source is stale; run pnpm docs:package');
  assert(Array.isArray(index.files) && index.files.some(file => file.path.endsWith('.md')), 'Missing Markdown pages');
  const names = index.files.map(file => file.path);
  assert(names.includes('llms.txt') && names.includes('llms-full.txt'), 'Missing LLM indexes');
  assert.equal(new Set(names).size, names.length, 'Duplicate documentation paths');
  for (const file of index.files) {
    const bytes = await readFile(artifactPath(directory, file.path));
    assert(isDocumentationResource(file.path), 'Unexpected documentation resource');
    assert(bytes.length > 0, `Empty documentation resource: ${file.path}`);
    assert.equal(bytes.length, file.bytes, `Documentation size mismatch: ${file.path}`);
    assert.equal(hash(bytes), file.sha256, `Documentation hash mismatch: ${file.path}`);
  }
  assert.deepEqual(await filesUnder(directory), [...names, 'index.json'].sort(compare), 'Unindexed documentation files');
  return index;
}

export async function prepareDocumentation(root = repositoryRoot, checkOnly = false) {
  const destination = path.join(root, 'packages/creator/dist/documentation');
  const identity = await sourceIdentity(root);
  if (checkOnly) {
    await verifyDocumentation(destination, { version: identity.versions['@za38.03/agent-ui-creator'], sourceDigest: identity.sourceDigest });
    return;
  }
  const result = spawnPnpmSync(['--filter', '@za38.03/agent-ui-docs', 'build'], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Documentation build failed (${result.status})`);
  assert.deepEqual(await sourceIdentity(root), identity, 'Documentation source changed while building; retry');
  const output = path.join(root, 'website/doc_build');
  await mkdir(path.dirname(destination), { recursive: true });
  const staging = await mkdtemp(path.join(path.dirname(destination), '.documentation-'));
  try {
    const files = [];
    for (const name of await filesUnder(output)) {
      if (!isDocumentationResource(name)) continue;
      const source = artifactPath(output, name);
      const target = artifactPath(staging, name);
      const bytes = await readFile(source);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(source, target);
      files.push({ path: name, bytes: bytes.length, sha256: hash(bytes) });
    }
    const index = {
      schemaVersion: 1,
      packageName: '@za38.03/agent-ui-creator',
      packageVersion: identity.versions['@za38.03/agent-ui-creator'],
      ...identity,
      files,
    };
    await writeFile(path.join(staging, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
    await verifyDocumentation(staging);
    // Copy only after a complete validated build; remove obsolete pages as well.
    await rm(destination, { recursive: true, force: true });
    await mkdir(destination, { recursive: true });
    for (const name of await filesUnder(staging)) {
      const target = artifactPath(destination, name);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(artifactPath(staging, name), target);
    }
    await verifyDocumentation(destination, { sourceDigest: identity.sourceDigest });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await prepareDocumentation(repositoryRoot, process.argv.includes('--check'));
  console.log('Creator offline documentation verified.');
}
