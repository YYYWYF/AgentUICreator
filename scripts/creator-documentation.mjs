import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, readdir, mkdir, rm, copyFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnPnpmSync } from './pnpm-process.mjs';
import { agentIndexPath, buildAgentDocumentation, referenceDocuments, referenceManifest } from './creator-agent-documentation.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const hash = data => createHash('sha256').update(data).digest('hex');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const modules = ['core', 'renderer', 'runtime', 'plugins', 'web-component', 'creator'];
const skipped = new Set(['node_modules', 'doc_build', '.rspress', '.git', 'pnpm-lock.yaml']);
const textSourceExtensions = new Set(['.md', '.mdx', '.txt', '.json', '.yaml', '.yml', '.ts', '.tsx', '.js', '.mjs', '.css']);
export const staticWebsiteManifest = 'agent-ui-static-site.json';

export function isDocumentationResource(name) {
  if (name === agentIndexPath) return true;
  const extension = path.posix.extname(name).toLowerCase();
  // Creator's reference tool reads text only. Website images have one owner
  // and remain in the complete static site, never in this offline text snapshot.
  return extension === '.md' || name === 'llms.txt' || name === 'llms-full.txt';
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

async function websiteSourceRecords(root) {
  const website = path.join(root, 'website');
  try {
    const manifest = JSON.parse(await readFile(path.join(website, staticWebsiteManifest), 'utf8'));
    return manifest.sourceRecords ?? [];
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
agent-ui-static-site.json 记录本次生成信息。
仓库交接包另含 artifacts/creator-documentation/ 文本参考资料，供 Creator 构建时使用，请随仓库保留。图片只随本静态网站交付；单独部署本静态网站无需该参考资料目录。
`);
  const files = [];
  for (const name of await filesUnder(directory)) {
    if (name === staticWebsiteManifest) continue;
    const bytes = await readFile(artifactPath(directory, name));
    files.push({ path: name, bytes: bytes.length, sha256: hash(bytes) });
  }
  const manifest = { schemaVersion: 1, sourceRecords, files };
  await writeFile(path.join(directory, staticWebsiteManifest), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function documentationIdentity(root) {
  const versions = {};
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
    const content = textSourceExtensions.has(path.posix.extname(name))
      ? bytes.toString('utf8').replace(/\r\n/gu, '\n') : bytes;
    records.push([name, hash(content)]);
  }
  records.push(...await websiteSourceRecords(root));
  records.sort(([a], [b]) => compare(a, b));
  return { versions, sourceDigest: hash(JSON.stringify(records)) };
}

export async function buildStaticWebsite(root = repositoryRoot) {
  const websiteSources = await websiteSourceRecords(root);
  const result = spawnPnpmSync(['build'], { cwd: path.join(root, 'website'), stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Documentation build failed (${result.status})`);
  const directory = path.join(root, 'website/doc_build');
  return { directory, manifest: await sealStaticWebsite(directory, websiteSources) };
}

export async function generateDocumentation(root = repositoryRoot) {
  const destination = path.join(root, 'artifacts/creator-documentation');
  const identity = await documentationIdentity(root);
  const website = await buildStaticWebsite(root);
  const output = website.directory;
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
    await rm(destination, { recursive: true, force: true });
    await mkdir(destination, { recursive: true });
    for (const name of await filesUnder(staging)) {
      const target = artifactPath(destination, name);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(artifactPath(staging, name), target);
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return website;
}

export async function prepareDocumentation(root = repositoryRoot) {
  const source = path.join(root, 'artifacts/creator-documentation');
  const destination = path.join(root, 'packages/creator/dist/documentation');
  const hasDocumentation = await stat(source).then(() => true, error => {
    if (error.code === 'ENOENT') return false;
    throw error;
  });
  await rm(destination, { recursive: true, force: true });
  if (hasDocumentation) await cp(source, destination, { recursive: true });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.includes('--generate')) {
    await generateDocumentation();
    await prepareDocumentation();
    console.log('Creator offline documentation generated.');
  } else {
    await prepareDocumentation();
    console.log('Creator offline documentation copied when available.');
  }
}
