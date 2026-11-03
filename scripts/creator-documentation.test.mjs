import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { artifactPath, documentationIdentity, isDocumentationResource, logicalPath, prepareDocumentation, verifyDocumentation } from './creator-documentation.mjs';
import { buildAgentDocumentation, documentationSections, portableReferenceLinks, referenceManifest } from './creator-agent-documentation.mjs';

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'creator docs 文档 '));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const files = [];
  for (const [name, content] of [
    ['guide/start.md', '# Start\nOffline instructions.'],
    ['llms.txt', '## Getting started\n- [Start](/guide/start.md): Offline instructions.'],
    ['llms-full.txt', '# Start\nOffline instructions.'],
    ['images/example.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>'],
  ]) {
    const file = artifactPath(directory, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
    files.push({ path: name, bytes: Buffer.byteLength(content), sha256: createHash('sha256').update(content).digest('hex') });
  }
  await mkdir(artifactPath(directory, path.posix.dirname(referenceManifest)), { recursive: true });
  await writeFile(artifactPath(directory, referenceManifest), JSON.stringify({ schemaVersion: 1, documents: [] }));
  await buildAgentDocumentation(directory, directory);
  await rm(path.join(directory, 'packages'), { recursive: true });
  for (const name of ['agent-index.json', 'creator-index.md']) {
    const bytes = await readFile(path.join(directory, name));
    files.push({ path: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const index = { schemaVersion: 1, packageName: '@za38.03/agent-ui-creator', packageVersion: '1.2.3', versions: { '@za38.03/agent-ui-creator': '1.2.3' }, sourceDigest: 'a'.repeat(64), files };
  await writeFile(path.join(directory, 'index.json'), JSON.stringify(index));
  return { directory, index };
}

test('offline snapshot is readable outside the repository and rejects mismatched versions/sources', async t => {
  const { directory } = await fixture(t);
  await verifyDocumentation(directory, { version: '1.2.3', sourceDigest: 'a'.repeat(64) });
  assert.match(await readFile(artifactPath(directory, 'guide/start.md'), 'utf8'), /Offline instructions/u);
  await assert.rejects(verifyDocumentation(directory, { version: '1.2.4' }), /version is stale/u);
  await assert.rejects(verifyDocumentation(directory, { sourceDigest: 'b'.repeat(64) }), /source is stale/u);
});

test('rejects tampered, missing and unindexed package resources', async t => {
  const { directory } = await fixture(t);
  await writeFile(artifactPath(directory, 'guide/start.md'), 'changed');
  await assert.rejects(verifyDocumentation(directory), /mismatch/u);
  await rm(artifactPath(directory, 'guide/start.md'));
  await assert.rejects(verifyDocumentation(directory), /ENOENT/u);
  await writeFile(artifactPath(directory, 'guide/start.md'), '# Start\nOffline instructions.');
  await writeFile(path.join(directory, 'unlisted.md'), '# Old page');
  await assert.rejects(verifyDocumentation(directory), /Unindexed/u);
});

test('Windows filesystem paths become portable manifest paths; unsafe identifiers are rejected', () => {
  assert.equal(logicalPath('C:\\工程 空间\\docs', 'C:\\工程 空间\\docs\\guide\\start.md', path.win32), 'guide/start.md');
  assert.equal(logicalPath('/docs', '/docs/guide/start.md', path.posix), 'guide/start.md');
  for (const name of ['../outside.md', '/outside.md', 'C:/outside.md', 'guide\\start.md', 'guide/../../outside.md', 'guide//start.md']) {
    assert.throws(() => artifactPath('/docs', name), /Invalid/u);
  }
});

test('offline distribution includes documentation and images, not the website application', () => {
  for (const name of ['guide/index.md', 'llms.txt', 'llms-full.txt', 'images/界面.PNG']) assert(isDocumentationResource(name));
  for (const name of ['index.html', 'static/js/app.js', 'static/js/app.js.LICENSE.txt', 'static/search.json', 'style.css']) assert(!isDocumentationResource(name));
});

async function handoffFixture(t) {
  const { directory, index } = await fixture(t);
  const root = await mkdtemp(path.join(tmpdir(), 'creator handoff 中文 '));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'scripts'));
  await writeFile(path.join(root, 'scripts/creator-documentation.mjs'), '// packaging script');
  await writeFile(path.join(root, 'scripts/creator-agent-documentation.mjs'), '// indexing script');
  await mkdir(artifactPath(root, path.posix.dirname(referenceManifest)), { recursive: true });
  await writeFile(artifactPath(root, referenceManifest), JSON.stringify({ schemaVersion: 1, documents: [{ path: 'docs/current.md', topic: 'Internal', summary: 'Current architecture' }] }));
  await mkdir(path.join(root, 'docs'));
  await writeFile(path.join(root, 'docs/current.md'), '# Current\n## Scope\nCurrent architecture.');
  await mkdir(path.join(root, 'website/docs'), { recursive: true });
  await writeFile(path.join(root, 'website/docs/index.md'), '# Source\n');
  for (const module of ['core', 'renderer', 'runtime', 'plugins', 'web-component', 'creator']) {
    const target = path.join(root, 'packages', module);
    await mkdir(target, { recursive: true });
    await writeFile(path.join(target, 'package.json'), JSON.stringify({ name: `@za38.03/agent-ui-${module}`, version: '1.2.3' }));
  }
  const source = path.join(root, 'artifacts/creator-documentation');
  await cp(directory, source, { recursive: true });
  await buildAgentDocumentation(root, source);
  const resources = [...index.files.filter(file => !['agent-index.json', 'creator-index.md'].includes(file.path))];
  for (const name of ['agent-index.json', 'creator-index.md', 'references/docs/current.md']) {
    const bytes = await readFile(artifactPath(source, name));
    resources.push({ path: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const identity = await documentationIdentity(root);
  await writeFile(path.join(source, 'index.json'), JSON.stringify({ ...index, ...identity, files: resources }));
  return { root, source, destination: path.join(root, 'packages/creator/dist/documentation') };
}

test('clean intranet packaging copies static pages without documentation tooling and survives Creator dist cleanup', async t => {
  const { root, destination } = await handoffFixture(t);
  // No website package.json, node_modules, Rspress or executable exists here.
  await prepareDocumentation(root);
  await prepareDocumentation(root, true);
  await writeFile(path.join(destination, 'obsolete.md'), '# Obsolete');
  await prepareDocumentation(root);
  await assert.rejects(readFile(path.join(destination, 'obsolete.md')), { code: 'ENOENT' });
  await rm(path.join(root, 'packages/creator/dist'), { recursive: true });
  await prepareDocumentation(root);
  await verifyDocumentation(destination, { version: '1.2.3' });
  // The internal mirror may rebuild locks, or the transfer may omit them.
  await writeFile(path.join(root, 'pnpm-lock.yaml'), 'internal registry resolutions');
  await writeFile(path.join(root, 'website/pnpm-lock.yaml'), 'external tooling resolutions');
  await writeFile(path.join(root, 'website/docs/index.md'), '# Source\r\n');
  await prepareDocumentation(root, true);
  assert.match(await readFile(path.join(destination, 'images/example.svg'), 'utf8'), /<svg/u);
});

test('packaging fails for missing, tampered or stale handoff rather than skipping documentation', async t => {
  const { root, source } = await handoffFixture(t);
  await writeFile(path.join(source, 'guide/start.md'), '# Tampered');
  await assert.rejects(prepareDocumentation(root), /handoff is missing, stale or invalid/u);
  await rm(source, { recursive: true });
  await assert.rejects(prepareDocumentation(root), /external build machine/u);
  const other = await handoffFixture(t);
  await writeFile(path.join(other.root, 'website/docs/index.md'), '# New content');
  await assert.rejects(prepareDocumentation(other.root), /handoff is missing, stale or invalid/u);
  const versioned = await handoffFixture(t);
  await writeFile(path.join(versioned.root, 'packages/plugins/package.json'), JSON.stringify({ name: '@za38.03/agent-ui-plugins', version: '1.2.4' }));
  await assert.rejects(prepareDocumentation(versioned.root), /handoff is missing, stale or invalid/u);
  const referenced = await handoffFixture(t);
  await writeFile(path.join(referenced.root, 'docs/current.md'), '# Changed internal contract');
  await assert.rejects(prepareDocumentation(referenced.root), /handoff is missing, stale or invalid/u);
});

test('indexes real sections, ignoring code fences, and preserves exact CRLF/Unicode offsets', () => {
  const text = '# Doc\r\nIntro🌟\r\n## Services\r\n```tsx\r\n# not a heading\r\n```\r\n### Subscribe\r\nBody\r\n## Slots\r\nEnd';
  const sections = documentationSections(text);
  assert.deepEqual(sections.map(section => section.title), ['Doc', 'Services', 'Subscribe', 'Slots']);
  assert.equal(text.slice(sections[1].start, sections[1].end), '## Services\r\n```tsx\r\n# not a heading\r\n```\r\n### Subscribe\r\nBody\r\n');
  assert.equal(text.slice(sections[2].start, sections[2].end), '### Subscribe\r\nBody\r\n');
  const withPreamble = documentationSections('Preamble\n# C#\n## Slots ###\nBody');
  assert.equal(withPreamble[0].end, 'Preamble\n'.length);
  assert.deepEqual(withPreamble.map(section => section.title), ['Introduction', 'C#', 'Slots']);
});

test('installed internal references link to public Markdown and other indexed owners with portable separators', () => {
  const text = '[API](../../website/docs/development/plugin-api.md#服务) [Lexical](../../website/docs/plugins/lexical.mdx) [Owner](plugin-public-props.md) [External](https://example.com/docs) [Code](../../source.ts)';
  const result = portableReferenceLinks(text, 'docs/architecture/authoring.md', new Set(['development/plugin-api.md', 'plugins/lexical.md', 'references/docs/architecture/plugin-public-props.md']));
  assert.equal(result, '[API](../../../development/plugin-api.md#服务) [Lexical](../../../plugins/lexical.md) [Owner](plugin-public-props.md) [External](https://example.com/docs) [Code](../../source.ts)');
});

test('reference/index inputs reject missing and unsafe paths instead of publishing a partial catalog', async t => {
  const { root, source } = await handoffFixture(t);
  await rm(path.join(root, 'docs/current.md'));
  await assert.rejects(buildAgentDocumentation(root, source), /ENOENT/u);
  await writeFile(artifactPath(root, referenceManifest), JSON.stringify({ schemaVersion: 1, documents: [{ path: 'docs/../../outside.md', topic: 'Invalid', summary: 'Invalid' }] }));
  await assert.rejects(buildAgentDocumentation(root, source), /Invalid documentation path/u);
});

test('check mode also validates the staged package copy', async t => {
  const { root, destination } = await handoffFixture(t);
  await prepareDocumentation(root);
  await writeFile(path.join(destination, 'llms.txt'), 'tampered');
  await assert.rejects(prepareDocumentation(root, true), /mismatch/u);
});

test('root install excludes documentation compilers while the standalone website retains pinned tooling', async () => {
  const root = new URL('../', import.meta.url);
  const workspace = await readFile(new URL('pnpm-workspace.yaml', root), 'utf8');
  assert(!workspace.includes('website'));
  const lock = await readFile(new URL('pnpm-lock.yaml', root), 'utf8');
  assert(!/@rspress\/|@rspack\//u.test(lock));
  const website = JSON.parse(await readFile(new URL('website/package.json', root), 'utf8'));
  const version = website.devDependencies['@rspress/core'];
  assert.match(version, /^\d+\.\d+\.\d+$/u);
  assert((await readFile(new URL('website/pnpm-lock.yaml', root), 'utf8')).includes(`/@rspress/core@${version}`));
});
