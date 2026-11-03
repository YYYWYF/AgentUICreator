import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, mkdir, rm, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnPnpmSync } from './pnpm-process.mjs';
import { agentIndexPath, buildAgentDocumentation, referenceDocuments, referenceManifest, verifyAgentDocumentation } from './creator-agent-documentation.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const hash = data => createHash('sha256').update(data).digest('hex');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const modules = ['core', 'renderer', 'runtime', 'plugins', 'web-component', 'creator'];
const skipped = new Set(['node_modules', 'doc_build', '.rspress', '.git', 'pnpm-lock.yaml']);
const textSourceExtensions = new Set(['.md', '.mdx', '.txt', '.json', '.yaml', '.yml', '.ts', '.tsx', '.js', '.mjs', '.css']);
const resourceExtensions = new Set(['.md', '.txt', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif']);
export const staticWebsiteManifest = 'agent-ui-static-site.json';

export function isDocumentationResource(name) {
  if (name === agentIndexPath) return true;
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

export async function verifyStaticWebsite(directory) {
  const manifest = JSON.parse(await readFile(path.join(directory, staticWebsiteManifest), 'utf8'));
  assert.equal(manifest.schemaVersion, 1);
  assert(Array.isArray(manifest.sourceRecords) && manifest.sourceRecords.length > 0, 'Missing website source identity');
  const sourceNames = new Set();
  for (const [name, digest] of manifest.sourceRecords) {
    artifactPath(directory, name);
    assert(name.startsWith('website/') && !sourceNames.has(name), 'Invalid website source identity');
    assert.match(digest, /^[a-f0-9]{64}$/u);
    sourceNames.add(name);
  }
  assert(Array.isArray(manifest.files) && manifest.files.some(file => file.path === 'index.html'), 'Missing static website entry');
  const names = manifest.files.map(file => file.path);
  assert.equal(new Set(names).size, names.length, 'Duplicate static website paths');
  for (const file of manifest.files) {
    assert(!/(?:^|\/)(?:node_modules|package\.json|pnpm-lock\.yaml|rspress\.config\.ts)(?:\/|$)/u.test(file.path), 'Website tooling in static output');
    const bytes = await readFile(artifactPath(directory, file.path));
    assert.equal(bytes.length, file.bytes, `Static website size mismatch: ${file.path}`);
    assert.equal(hash(bytes), file.sha256, `Static website hash mismatch: ${file.path}`);
  }
  assert.deepEqual(await filesUnder(directory), [...names, staticWebsiteManifest].sort(compare), 'Unindexed static website files');
  return manifest;
}

async function websiteSourceRecords(root) {
  const website = path.join(root, 'website');
  // A transfer archive replaces the compiler project with its static output.
  // Its source hashes keep Creator prepack verifiable without shipping Rspress.
  try {
    await readFile(path.join(website, staticWebsiteManifest));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const records = [];
    for (const name of await filesUnder(website, skipped)) {
      const bytes = await readFile(artifactPath(website, name));
      const content = textSourceExtensions.has(path.posix.extname(name))
        ? bytes.toString('utf8').replace(/\r\n/gu, '\n') : bytes;
      records.push([`website/${name}`, hash(content)]);
    }
    return records;
  }
  return (await verifyStaticWebsite(website)).sourceRecords;
}

export async function sealStaticWebsite(directory, sourceRecords) {
  await writeFile(path.join(directory, 'DEPLOY.txt'), `Agent UI 内网静态文档部署

把本目录的全部内容复制到 Nginx、IIS 或现有静态文件服务器的站点根目录。
默认首页为 index.html；通过 HTTP/HTTPS 访问，不要双击 HTML 使用 file://。
本产物使用 / 作为站点根路径，请以独立站点部署（例如 https://docs.internal/）。
如需部署到子路径，请在外部构建环境配置 Rspress base 后重新构建。
保留所有目录结构，提供 .html、.js、.css、图片、.json、.md 和 .txt 文件。
启用目录默认首页 index.html；无扩展名的文章路径需映射到对应的 .html 文件。
例如 Nginx 的 location / 可使用：try_files $uri $uri.html $uri/index.html =404;
无需安装 Node.js、pnpm、Rspress 或 website 的任何 npm 依赖；搜索使用本地资源。
Markdown、llms.txt、llms-full.txt 是静态文档资源，请直接返回原文件。
agent-ui-static-site.json 是交接校验信息，请保留，勿手工修改构建产物。
Creator 使用的离线文档另存于仓库 artifacts/creator-documentation/，请一起保留。
`);
  const files = [];
  for (const name of await filesUnder(directory)) {
    if (name === staticWebsiteManifest) continue;
    const bytes = await readFile(artifactPath(directory, name));
    files.push({ path: name, bytes: bytes.length, sha256: hash(bytes) });
  }
  await writeFile(path.join(directory, staticWebsiteManifest), `${JSON.stringify({ schemaVersion: 1, sourceRecords, files }, null, 2)}\n`);
  await verifyStaticWebsite(directory);
}

export async function documentationIdentity(root) {
  const versions = {};
  // Installation locks may be regenerated for an intranet registry. They do not
  // change documentation content and are not part of its portable identity.
  const inputs = ['scripts/creator-documentation.mjs', 'scripts/creator-agent-documentation.mjs', referenceManifest,
    ...(await referenceDocuments(root)).map(document => document.path)];
  for (const module of modules) {
    const name = `packages/${module}/package.json`;
    const manifest = JSON.parse(await readFile(artifactPath(root, name), 'utf8'));
    versions[manifest.name] = manifest.version;
    inputs.push(name);
  }
  const records = [];
  for (const name of inputs.sort(compare)) {
    const bytes = await readFile(artifactPath(root, name));
    // Git may use CRLF in a Windows source checkout. Static artifact hashes stay
    // byte-exact, but equivalent source line endings must not invalidate handoff.
    const content = textSourceExtensions.has(path.posix.extname(name))
      ? bytes.toString('utf8').replace(/\r\n/gu, '\n') : bytes;
    records.push([name, hash(content)]);
  }
  records.push(...await websiteSourceRecords(root));
  records.sort(([a], [b]) => compare(a, b));
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
  assert(names.includes(agentIndexPath), 'Missing Creator document index');
  assert.equal(new Set(names).size, names.length, 'Duplicate documentation paths');
  for (const file of index.files) {
    const bytes = await readFile(artifactPath(directory, file.path));
    assert(isDocumentationResource(file.path), 'Unexpected documentation resource');
    assert(bytes.length > 0, `Empty documentation resource: ${file.path}`);
    assert.equal(bytes.length, file.bytes, `Documentation size mismatch: ${file.path}`);
    assert.equal(hash(bytes), file.sha256, `Documentation hash mismatch: ${file.path}`);
  }
  assert.deepEqual(await filesUnder(directory), [...names, 'index.json'].sort(compare), 'Unindexed documentation files');
  const catalog = await verifyAgentDocumentation(directory);
  assert(catalog.documents.every(document => names.includes(document.path)), 'Unindexed Creator document');
  return index;
}

export async function generateDocumentation(root = repositoryRoot) {
  const destination = path.join(root, 'artifacts/creator-documentation');
  const identity = await documentationIdentity(root);
  const websiteSources = await websiteSourceRecords(root);
  const result = spawnPnpmSync(['build'], { cwd: path.join(root, 'website'), stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Documentation build failed (${result.status})`);
  assert.deepEqual(await documentationIdentity(root), identity, 'Documentation source changed while building; retry');
  const output = path.join(root, 'website/doc_build');
  await sealStaticWebsite(output, websiteSources);
  await mkdir(path.dirname(destination), { recursive: true });
  const staging = await mkdtemp(path.join(path.dirname(destination), '.documentation-'));
  try {
    for (const name of await filesUnder(output)) {
      if (!isDocumentationResource(name)) continue;
      const source = artifactPath(output, name);
      const target = artifactPath(staging, name);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(source, target);
    }
    await buildAgentDocumentation(root, staging);
    assert.deepEqual(await documentationIdentity(root), identity, 'Documentation source changed while indexing; retry');
    const files = [];
    for (const name of await filesUnder(staging)) {
      const bytes = await readFile(artifactPath(staging, name));
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

// Build/prepack consumes an already generated, portable snapshot. Never launches
// a package manager or documentation compiler on the packaging machine.
export async function prepareDocumentation(root = repositoryRoot, checkOnly = false) {
  const source = path.join(root, 'artifacts/creator-documentation');
  const destination = path.join(root, 'packages/creator/dist/documentation');
  const identity = await documentationIdentity(root);
  const expected = { version: identity.versions['@za38.03/agent-ui-creator'], sourceDigest: identity.sourceDigest };
  try {
    const index = await verifyDocumentation(source, expected);
    assert.deepEqual(index.versions, identity.versions, 'Documentation package versions are stale');
  } catch (error) {
    throw new Error('Offline documentation handoff is missing, stale or invalid. Run pnpm docs:install and pnpm docs:package on the external build machine, then copy artifacts/creator-documentation with the source repository.', { cause: error });
  }
  if (checkOnly) {
    await verifyDocumentation(destination, expected);
    return;
  }
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  for (const name of await filesUnder(source)) {
    const target = artifactPath(destination, name);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(artifactPath(source, name), target);
  }
  await verifyDocumentation(destination, expected);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.includes('--generate')) {
    await generateDocumentation();
    await prepareDocumentation();
    console.log('Creator offline documentation generated and verified. Copy artifacts/creator-documentation with the source repository.');
  } else {
    await prepareDocumentation(repositoryRoot, process.argv.includes('--check'));
    console.log('Creator offline documentation verified.');
  }
}
