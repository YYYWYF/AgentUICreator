import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { releaseSnapshot, snapshotDigest, validateHistory, verifyLocalRelease } from './local-release-history.mjs';
import { syncPackageReleaseMetadata } from '../../../../../scripts/sync-package-release-metadata.mjs';

const compare = (a, b) => {
  for (const version of [a, b]) assert.match(version, /^\d+\.\d+\.\d+$/);
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] - right[i];
  return 0;
};
const descriptor = value => {
  compare(value.releaseVersion, value.releaseVersion);
  for (const plugin of Object.values(value.plugins)) compare(plugin.version, plugin.version);
  return value;
};
const entry = { summary: 'Reviewed change', changes: ['Authored release note'] };
const digest = text => createHash('sha256').update(text).digest('hex');
const record = (version = '1.0.0', source = 'original', pluginVersion = version) => ({
  descriptor: { releaseVersion: version, contractVersion: 1, plugins: { sample: { version: pluginVersion } } },
  plugins: { sample: { digest: digest(source), changelog: { '1.0.0': entry, [pluginVersion]: entry } } },
});
const history = () => ({ schemaVersion: 1, releases: [record()] });

test('explicit empty history supports a first release without changing input', () => {
  const current = record(), ledger = { schemaVersion: 1, releases: [] };
  const before = JSON.stringify({ current, ledger });
  assert.deepEqual(verifyLocalRelease(current, ledger, compare), { recorded: false });
  validateHistory(ledger, descriptor, compare);
  assert.equal(JSON.stringify({ current, ledger }), before);
  assert.throws(() => validateHistory({}, descriptor, compare), /Invalid/);
});
test('same prepared version is idempotent but changed contents are rejected', () => {
  assert.deepEqual(verifyLocalRelease(record(), history(), compare), { recorded: true });
  assert.throws(() => verifyLocalRelease(record('1.0.0', 'edited'), history(), compare), /Prepared release changed/);
  assert.throws(() => verifyLocalRelease(record('0.9.0'), history(), compare), /regressed/);
});
test('source changes need a Plugin bump; historical notes cannot be edited', () => {
  assert.throws(() => verifyLocalRelease(record('1.1.0', 'edited', '1.0.0'), history(), compare), /version bump/);
  verifyLocalRelease(record('1.1.0', 'edited'), history(), compare);
  const current = record('1.1.0', 'edited');
  current.plugins.sample.changelog['1.0.0'] = { summary: 'Rewritten', changes: ['wrong'] };
  assert.throws(() => verifyLocalRelease(current, history(), compare), /Historical changelog/);
});
test('history validates inventory, ordering, changelogs and transitions', () => {
  validateHistory(history(), descriptor, compare);
  assert.throws(() => validateHistory({ schemaVersion: 1, releases: [record(), record()] }, descriptor, compare), /advance/);
  const malformed = history(); malformed.releases[0].plugins.sample.digest = 'bad';
  assert.throws(() => validateHistory(malformed, descriptor, compare), /Invalid/);
  const missing = history(); missing.releases[0].plugins.sample.changelog = {};
  assert.throws(() => validateHistory(missing, descriptor, compare), /Missing/);
  assert.throws(() => validateHistory({ schemaVersion: 1, releases: [record(), record('1.1.0', 'changed', '1.0.0')] }, descriptor, compare), /version bump/);
});
test('removed Plugins can return only with retained historical notes and versions', () => {
  const ledger = history();
  ledger.releases.push({ descriptor: { releaseVersion: '1.1.0', contractVersion: 1, plugins: {} }, plugins: {} });
  const returning = record('1.2.0');
  delete returning.plugins.sample.changelog['1.0.0'];
  assert.throws(() => verifyLocalRelease(returning, ledger, compare), /Historical/);
});
test('snapshot captures portable content hashes without retaining native paths', () => {
  for (const nativePath of [path.win32.join('C:\\release with spaces', '源', 'index.ts'), path.posix.join('/release with spaces', '源', 'index.ts')]) {
    const release = { descriptor: record().descriptor, changelogs: { sample: { '1.0.0': entry } }, registry: { byId: new Map([['plugin/sample', { source: 'same LF content', absolutePath: nativePath }]]) } };
    const snapshot = releaseSnapshot(release, item => digest(item.source));
    assert.equal(snapshot.plugins.sample.digest, digest('same LF content'));
    assert.ok(!JSON.stringify(snapshot).includes(nativePath));
    assert.match(snapshotDigest(snapshot), /^[a-f0-9]{64}$/);
    release.descriptor.plugins.sample.version = '9.0.0';
    assert.equal(snapshot.descriptor.plugins.sample.version, '1.0.0');
  }
});
test('metadata check-only validates local compatibility without writing files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-ui-release-源 '));
  try {
    await mkdir(path.join(root, 'releases'));
    await mkdir(path.join(root, 'packages/plugins/dist'), { recursive: true });
    const manifest = { schemaVersion: 1, releases: [{ packages: [{ name: '@za38.03/agent-ui-plugins', version: '1.0.0', requires: {} }] }] };
    const pkg = { name: '@za38.03/agent-ui-plugins', version: '1.0.0', agentUI: { schemaVersion: 1, compatibility: manifest } };
    const files = [path.join(root, 'releases/compatibility.json'), path.join(root, 'packages/plugins/package.json'), path.join(root, 'packages/plugins/dist/compatibility.json')];
    const contents = [manifest, pkg, manifest].map(value => JSON.stringify(value));
    await Promise.all(files.map((file, i) => writeFile(file, contents[i])));
    await syncPackageReleaseMetadata('plugins', root, { publishing: true, checkOnly: true });
    assert.deepEqual(await Promise.all(files.map(file => readFile(file, 'utf8'))), contents);
    await writeFile(files[2], '{}');
    await assert.rejects(syncPackageReleaseMetadata('plugins', root, { publishing: true, checkOnly: true }), /Stale bundled/);
    assert.equal(await readFile(files[2], 'utf8'), '{}');
    manifest.releases = [];
    await writeFile(files[0], JSON.stringify(manifest));
    await assert.rejects(syncPackageReleaseMetadata('plugins', root, { publishing: true, checkOnly: true }), /Review compatibility/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
