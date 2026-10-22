import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { artifactPath, isDocumentationResource, logicalPath, verifyDocumentation } from './creator-documentation.mjs';

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'creator docs 文档 '));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const files = [];
  for (const [name, content] of [
    ['guide/start.md', '# Start\nOffline instructions.'],
    ['llms.txt', '[Start](guide/start.md)'],
    ['llms-full.txt', '# Start\nOffline instructions.'],
  ]) {
    const file = artifactPath(directory, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
    files.push({ path: name, bytes: Buffer.byteLength(content), sha256: createHash('sha256').update(content).digest('hex') });
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
