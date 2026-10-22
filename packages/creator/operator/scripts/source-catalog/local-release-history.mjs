import { createHash } from 'node:crypto';

// These are preparation records, not claims that a version exists on npm.
export function releaseSnapshot(release, sourceDigest) {
  return {
    descriptor: structuredClone(release.descriptor),
    plugins: Object.fromEntries(Object.keys(release.descriptor.plugins).sort().map(id => [id, {
      digest: sourceDigest(release.registry.byId.get(`plugin/${id}`)),
      changelog: structuredClone(release.changelogs[id]),
    }])),
  };
}
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
export const snapshotDigest = snapshot => createHash('sha256').update(JSON.stringify(canonical(snapshot))).digest('hex');

export function validateHistory(history, parseDescriptor, compareVersions) {
  if (history?.schemaVersion !== 1 || !Array.isArray(history.releases)) throw new Error('Invalid local release history');
  let previous;
  const checked = { releases: [] };
  for (const snapshot of history.releases) {
    const descriptor = parseDescriptor(snapshot.descriptor);
    if (snapshot.sharedDigest !== undefined && !/^[a-f0-9]{64}$/.test(snapshot.sharedDigest)) throw new Error('Invalid shared source digest');
    if (previous && compareVersions(descriptor.releaseVersion, previous) <= 0) throw new Error('Local release history must advance');
    if (!snapshot.plugins || !equal(Object.keys(snapshot.plugins).sort(), Object.keys(descriptor.plugins).sort())) throw new Error('Invalid history Plugin inventory');
    for (const [id, plugin] of Object.entries(snapshot.plugins)) {
      if (!/^[a-f0-9]{64}$/.test(plugin.digest) || !plugin.changelog || typeof plugin.changelog !== 'object' || Array.isArray(plugin.changelog)) throw new Error(`Invalid local Plugin record: ${id}`);
      for (const [version, entry] of Object.entries(plugin.changelog)) {
        compareVersions(version, version);
        if (!entry || typeof entry.summary !== 'string' || !entry.summary.trim() || !Array.isArray(entry.changes) || !entry.changes.length || entry.changes.some(change => typeof change !== 'string' || !change.trim())) throw new Error(`Invalid historical changelog: ${id}@${version}`);
      }
      if (!plugin.changelog[descriptor.plugins[id].version]) throw new Error(`Missing historical changelog: ${id}`);
    }
    verifyLocalRelease(snapshot, checked, compareVersions);
    checked.releases.push(snapshot);
    previous = descriptor.releaseVersion;
  }
  return history;
}

export function verifyLocalRelease(current, history, compareVersions) {
  const latest = history.releases.at(-1);
  if (!latest) return { recorded: false };
  const order = compareVersions(current.descriptor.releaseVersion, latest.descriptor.releaseVersion);
  if (order < 0) throw new Error('Release version regressed against local history');
  if (order === 0) {
    if (!equal(current, latest)) throw new Error('Prepared release changed; restore its contents or advance the release version');
    return { recorded: true };
  }
  for (const [id, plugin] of Object.entries(current.plugins)) {
    const old = latest.plugins[id];
    if (!old) continue;
    const change = compareVersions(current.descriptor.plugins[id].version, latest.descriptor.plugins[id].version);
    if (change < 0) throw new Error(`Plugin version regressed: ${id}`);
    if (plugin.digest !== old.digest && change <= 0) throw new Error(`Changed plugin needs a version bump and changelog: ${id}`);
  }
  // Retain history even across removal and later reintroduction of a Plugin.
  for (const record of history.releases) for (const [id, old] of Object.entries(record.plugins)) {
    const plugin = current.plugins[id];
    if (!plugin) continue;
    if (compareVersions(current.descriptor.plugins[id].version, record.descriptor.plugins[id].version) < 0) throw new Error(`Plugin version regressed: ${id}`);
    for (const [version, entry] of Object.entries(old.changelog)) {
      if (!equal(plugin.changelog[version], entry)) throw new Error(`Historical changelog must be retained: ${id}@${version}`);
    }
  }
  return { recorded: false };
}
