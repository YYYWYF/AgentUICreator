import { validateOfficialPackageServices } from './verify-package-services.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSourceRelease, verifySourceRelease, pluginSourceDigest, parseReleaseDescriptor, comparePluginVersions } from '../../src/source-catalog/release.ts';
import { syncPackageReleaseMetadata } from '../../../../../scripts/sync-package-release-metadata.mjs';
import { releaseSnapshot, validateHistory, verifyLocalRelease, snapshotDigest } from './local-release-history.mjs';

const args = process.argv.slice(2);
if (args.some(arg => !['--verify', '--record'].includes(arg)) || (args.includes('--verify') && args.includes('--record'))) {
  throw new Error('Use --verify (read-only) or --record (save a validated local preparation record)');
}
const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const targetRoot = path.join(root, 'packages/plugins/resources/registry');
const historyFile = path.join(root, 'releases/plugins-history.json');
const historyText = await readFile(historyFile, 'utf8'); // Missing history is an error, never an implicit first release.
const history = validateHistory(JSON.parse(historyText), parseReleaseDescriptor, comparePluginVersions);
await syncPackageReleaseMetadata('plugins', root, { publishing: true, checkOnly: true });
const target = await resolveSourceRelease(targetRoot);
const pkg = JSON.parse(await readFile(path.join(root, 'packages/plugins/package.json'), 'utf8'));
if (pkg.version !== target.descriptor.releaseVersion) throw new Error('Package version must match releaseVersion');
await validateOfficialPackageServices(target.registry);
for (const item of target.registry.items) for (const file of item.loadedFiles) {
  if (/(^|\/)vendors?(\/|$)/iu.test(file.target)) throw new Error(`Upstream source must remain inside runtime packages: ${item.id}: ${file.target}`);
}
verifySourceRelease(target);
// Include modern implementation files, not only the historical resource views.
const catalog = JSON.parse(await readFile(path.join(root, 'packages/plugins/dist/catalog.json'), 'utf8'));
const sources = files => files.map(({ path: logicalPath, sha256 }) => [logicalPath, sha256]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const snapshot = releaseSnapshot(target, item => {
  const plugin = catalog.plugins.find(plugin => `plugin/${plugin.id}` === item.id);
  if (!plugin) throw new Error(`Missing Plugin catalog entry: ${item.id}`);
  return hash({ resource: pluginSourceDigest(item), implementation: sources(plugin.files) });
});
snapshot.sharedDigest = hash(sources(catalog.shared));
const { recorded } = verifyLocalRelease(snapshot, history, comparePluginVersions);
if (args.includes('--record') && !recorded) {
  // Refuse concurrent edits rather than replacing a history changed during validation.
  if (await readFile(historyFile, 'utf8') !== historyText) throw new Error('Local release history changed; retry validation');
  history.releases.push(snapshot);
  await writeFile(historyFile, JSON.stringify(history, null, 2) + '\n');
}
console.log(`Local release ${target.descriptor.releaseVersion} verified (${snapshotDigest(snapshot)}).`);
console.log(args.includes('--record') ? 'Preparation record saved; this does not mark the version as published.' : 'Read-only check complete; versions, changelogs and history were not modified.');
