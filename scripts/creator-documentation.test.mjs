import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, mkdir, readFile, realpath, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';
import { artifactPath, documentationIdentity, isDocumentationResource, logicalPath, prepareDocumentation, sealStaticWebsite } from './creator-documentation.mjs';
import { packageRepository } from './package-repository.mjs';
import { buildAgentDocumentation, documentationSections, portableReferenceLinks, referenceManifest } from './creator-agent-documentation.mjs';
import { spawnPnpmSync } from './pnpm-process.mjs';

test('documented thin application examples compile against installed public declarations', async t => {
  const repository = fileURLToPath(new URL('../', import.meta.url));
  const root = await mkdtemp(path.join(tmpdir(), 'Creator 文档 snippets '));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await symlink(path.join(repository, 'packages/creator/node_modules'), path.join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  let index = 0;
  for (const name of ['development/component-customization.md', 'plugins/conversation-suggestions.mdx']) {
    const text = await readFile(path.join(repository, 'website/docs', name), 'utf8');
    const snippet = [...text.matchAll(/```tsx\r?\n([\s\S]*?)\r?\n```/gu)].map(match => match[1])
      .find(code => code.includes('export const ') && code.includes('@za38.03/agent-ui-plugins/'));
    assert(snippet, `Missing complete thin-application example: ${name}`);
    await writeFile(path.join(root, `example${index++}.tsx`), snippet);
  }
  await writeFile(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { noEmit: true, strict: true, skipLibCheck: true, jsx: 'react-jsx', module: 'ESNext', moduleResolution: 'Bundler', target: 'ES2022' }, include: ['*.tsx'] }));
  const result = spawnPnpmSync(['--filter', '@za38.03/agent-ui-creator', 'exec', 'tsc', '-p', path.join(root, 'tsconfig.json')], { cwd: repository, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

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
  await writeFile(path.join(destination, 'obsolete.md'), '# Obsolete');
  await prepareDocumentation(root);
  await assert.rejects(readFile(path.join(destination, 'obsolete.md')), { code: 'ENOENT' });
  await rm(path.join(root, 'packages/creator/dist'), { recursive: true });
  await prepareDocumentation(root);
  assert.match(await readFile(path.join(destination, 'guide/start.md'), 'utf8'), /Offline instructions/u);
  // The internal mirror may rebuild locks, or the transfer may omit them.
  await writeFile(path.join(root, 'pnpm-lock.yaml'), 'internal registry resolutions');
  await writeFile(path.join(root, 'website/pnpm-lock.yaml'), 'external tooling resolutions');
  await writeFile(path.join(root, 'website/docs/index.md'), '# Source\r\n');
  assert.match(await readFile(path.join(destination, 'images/example.svg'), 'utf8'), /<svg/u);
});

function zipEntries(zip) {
  const entries = new Map();
  let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const size = zip.readUInt32LE(offset + 18), nameLength = zip.readUInt16LE(offset + 26), extra = zip.readUInt16LE(offset + 28);
    const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const start = offset + 30 + nameLength + extra;
    entries.set(name, inflateRawSync(zip.subarray(start, start + size)));
    offset = start + size;
  }
  return entries;
}

async function copyIntranetAssets(root) {
  const creator = path.join(root, 'packages/creator');
  for (const name of ['src/ui/creator-workbench.css', 'src/ui/components/creator-ui.css', 'src/ui/components/LICENSE.md', 'src/ui/setup/creator-project-setup.css', 'src/agent/prompts.json', 'dist/cli.js']) {
    const file = path.join(creator, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, name.endsWith('.json') ? '{}' : '// prepared asset');
  }
  await mkdir(path.join(creator, 'scripts'), { recursive: true });
  await cp(new URL('../packages/creator/scripts/copy-assets.mjs', import.meta.url), path.join(creator, 'scripts/copy-assets.mjs'));
  const result = spawnSync(process.execPath, ['scripts/copy-assets.mjs'], { cwd: creator, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

test('static-only ZIP preserves Creator identity and repackages without website tooling', async t => {
  const { root } = await handoffFixture(t);
  const identity = await documentationIdentity(root);
  const bytes = await readFile(path.join(root, 'website/docs/index.md'));
  const sourceRecords = [['website/docs/index.md', createHash('sha256').update(bytes).digest('hex')]];
  await rm(path.join(root, 'website'), { recursive: true });
  await mkdir(path.join(root, 'website/static'), { recursive: true });
  await writeFile(path.join(root, 'website/index.html'), '<html><script src="/static/app.js"></script></html>');
  await writeFile(path.join(root, 'website/static/app.js'), 'console.log("本地文档");');
  await sealStaticWebsite(path.join(root, 'website'), sourceRecords);
  assert.deepEqual(await documentationIdentity(root), identity);
  await prepareDocumentation(root);
  const output = path.join(root, 'transfer.zip');
  await packageRepository(root, output);
  const entries = zipEntries(await readFile(output));
  const prefix = path.basename(root);
  assert.equal(entries.get(`${prefix}/website/static/app.js`).toString(), 'console.log("本地文档");');
  assert(entries.has(`${prefix}/website/index.html`));
  assert(entries.has(`${prefix}/website/DEPLOY.txt`));
  assert(entries.has(`${prefix}/artifacts/creator-documentation/index.json`));
  assert([...entries.keys()].every(name => !name.includes('\\') && !name.endsWith('/transfer.zip')));
  assert([...entries.keys()].every(name => !/website\/(?:package\.json|docs\/|theme\/|doc_build\/|node_modules\/)/u.test(name)));
  // Extract the actual ZIP to a fresh directory, including Unicode and spaces.
  const extracted = path.join(root, '解压 空间');
  for (const [name, content] of entries) {
    const target = artifactPath(extracted, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  const transferred = path.join(extracted, prefix);
  await rm(path.join(transferred, 'packages/creator/dist'), { recursive: true });
  await rm(path.join(transferred, 'website'), { recursive: true });
  await rm(path.join(transferred, 'scripts'), { recursive: true });
  await copyIntranetAssets(transferred);
  assert.match(await readFile(path.join(transferred, 'packages/creator/dist/documentation/guide/start.md'), 'utf8'), /Offline instructions/u);
});

test('source packaging builds a complete static website for repository and standalone ZIPs', async t => {
  for (const websiteOnly of [false, true]) await t.test(websiteOnly ? 'website only' : 'repository', async t => {
    const { root } = await handoffFixture(t);
    if (websiteOnly) {
      await rm(path.join(root, 'artifacts'), { recursive: true });
      await rm(path.join(root, 'packages'), { recursive: true });
    }
    await writeFile(path.join(root, 'website/package.json'), JSON.stringify({ type: 'module', scripts: { build: 'node build.mjs' } }));
    await writeFile(path.join(root, 'website/build.mjs'), `
      import { mkdir, writeFile } from 'node:fs/promises';
      const files = ${JSON.stringify({
        'index.html': '<html><script src="/static/app.js"></script><img src="/images/界面.svg"/></html>',
        'static/app.js': 'fetch("/static/search.json");',
        'static/search.json': '{"local":true}',
        'images/界面.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
        'guide/start.md': '# Start\nOffline instructions.',
        'llms.txt': '## Getting started\n- [Start](/guide/start.md): Offline instructions.',
        'llms-full.txt': '# Full documentation',
      })};
      for (const [name, content] of Object.entries(files)) {
        const target = new URL('./doc_build/' + name, import.meta.url);
        await mkdir(new URL('./', target), { recursive: true });
        await writeFile(target, content);
      }
    `);
    await mkdir(path.join(root, 'website/theme'), { recursive: true });
    await writeFile(path.join(root, 'website/theme/index.tsx'), '// source only');
    await writeFile(path.join(root, 'website/pnpm-lock.yaml'), 'compiler dependencies');
    const output = path.join(root, '文档 transfer.zip');
    await packageRepository(root, output, { websiteOnly });
    const entries = zipEntries(await readFile(output));
    const prefix = websiteOnly ? '' : `${path.basename(root)}/`;
    const websiteEntries = [...entries.keys()].filter(name => name.startsWith(`${prefix}website/`));
    const manifest = JSON.parse(await readFile(path.join(root, 'website/doc_build/agent-ui-static-site.json'), 'utf8'));
    assert.deepEqual(websiteEntries.sort(), [...manifest.files.map(file => `${prefix}website/${file.path}`), `${prefix}website/agent-ui-static-site.json`].sort());
    assert.equal(entries.get(`${prefix}website/static/search.json`).toString(), '{"local":true}');
    assert.match(entries.get(`${prefix}website/images/界面.svg`).toString(), /<svg/u);
    assert([...entries.keys()].every(name => !name.includes('\\')));
    assert([...entries.keys()].every(name => !/website\/(?:package\.json|pnpm-lock\.yaml|build\.mjs|docs\/|theme\/|doc_build\/|node_modules\/)/u.test(name)));
    assert.equal(entries.has(`${prefix}artifacts/creator-documentation/index.json`), !websiteOnly);
    if (websiteOnly) {
      assert.equal(entries.size, websiteEntries.length);
      await assert.rejects(readFile(path.join(root, 'artifacts/creator-documentation/index.json')), { code: 'ENOENT' });
    }
    assert.match(await readFile(path.join(root, 'website/theme/index.tsx'), 'utf8'), /source only/u);
    assert.match(await readFile(path.join(root, 'website/docs/index.md'), 'utf8'), /Source/u);
  });
});

test('intranet ZIP packaging copies plain static files without manifests, Creator handoff or website tooling', async t => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'website only 中文 ')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'website'));
  await writeFile(path.join(root, 'website/index.html'), '<html>Static</html>');
  await mkdir(path.join(root, 'scripts'));
  const entry = path.join(root, 'scripts/package-repository.mjs');
  await cp(new URL('./package-repository.mjs', import.meta.url), entry);
  const output = path.join(root, 'static.zip');
  let result = spawnSync(process.execPath, [entry, '--website-only', output], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const entries = zipEntries(await readFile(output));
  assert.equal(entries.get('website/index.html').toString(), '<html>Static</html>');
  assert([...entries.keys()].every(name => name.startsWith('website/')));
  await writeFile(path.join(root, 'website/index.html'), '<html>Updated on intranet</html>');
  result = spawnSync(process.execPath, [entry, output], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const repository = zipEntries(await readFile(output));
  assert.equal(repository.get(`${path.basename(root)}/website/index.html`).toString(), '<html>Updated on intranet</html>');
});

test('snapshot preparation and build assets copy unvalidated content and skip missing documentation', async t => {
  const { root, source, destination } = await handoffFixture(t);
  await writeFile(path.join(source, 'guide/start.md'), '# Changed without reindexing');
  await writeFile(path.join(source, 'index.json'), 'not a JSON manifest');
  for (const copy of [prepareDocumentation, copyIntranetAssets]) {
    await copy(root);
    assert.equal(await readFile(path.join(destination, 'index.json'), 'utf8'), 'not a JSON manifest');
    assert.equal(await readFile(path.join(destination, 'guide/start.md'), 'utf8'), '# Changed without reindexing');
  }
  await rm(path.join(source, 'index.json'));
  for (const copy of [prepareDocumentation, copyIntranetAssets]) {
    await copy(root);
    await assert.rejects(readFile(path.join(destination, 'index.json')), { code: 'ENOENT' });
    assert.equal(await readFile(path.join(destination, 'guide/start.md'), 'utf8'), '# Changed without reindexing');
  }
  await rm(source, { recursive: true });
  for (const copy of [prepareDocumentation, copyIntranetAssets]) {
    await mkdir(destination, { recursive: true });
    await writeFile(path.join(destination, 'obsolete.md'), '# Obsolete');
    await copy(root);
    await assert.rejects(readFile(path.join(destination, 'obsolete.md')), { code: 'ENOENT' });
  }
});

test('snapshot preparation accepts changed sources, package versions and intranet dependency metadata', async t => {
  const { root, source, destination } = await handoffFixture(t);
  await writeFile(path.join(root, 'website/docs/index.md'), '# New content\r\n');
  await writeFile(path.join(root, 'docs/current.md'), '# Changed internal contract');
  for (const module of ['plugins', 'creator']) {
    await writeFile(path.join(root, 'packages', module, 'package.json'), JSON.stringify({
      name: `@za38.03/agent-ui-${module}`, version: '1.2.4',
      dependencies: { '@za38.03/agent-ui-core': '1.2.4' },
    }, null, 4));
  }
  await prepareDocumentation(root);
  assert.deepEqual(await readFile(path.join(destination, 'index.json')), await readFile(path.join(source, 'index.json')));
});

test('snapshot copy does not require website sources, repository scripts or package metadata', async t => {
  const { root, destination } = await handoffFixture(t);
  for (const directory of ['website', 'scripts', 'docs', 'packages']) {
    await rm(path.join(root, directory), { recursive: true });
  }
  await prepareDocumentation(root);
  assert.match(await readFile(path.join(destination, 'guide/start.md'), 'utf8'), /Offline instructions/u);
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

test('publication with an existing --check invocation succeeds without documentation', async t => {
  const { root, source } = await handoffFixture(t);
  for (const name of ['creator-documentation.mjs', 'creator-agent-documentation.mjs', 'pnpm-process.mjs']) {
    await cp(new URL(name, import.meta.url), path.join(root, 'scripts', name));
  }
  const entry = await realpath(path.join(root, 'scripts/creator-documentation.mjs'));
  await rm(source, { recursive: true });
  let result = spawnSync(process.execPath, [entry, '--check'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  await mkdir(source, { recursive: true });
  await writeFile(path.join(source, 'index.json'), 'not JSON');
  result = spawnSync(process.execPath, [entry, '--check'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(path.join(root, 'packages/creator/dist/documentation/index.json'), 'utf8'), 'not JSON');
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
