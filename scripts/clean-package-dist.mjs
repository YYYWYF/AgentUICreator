import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const owners = new Set(['core', 'renderer', 'runtime']);
export function packageDistUrl(owner, repository = new URL('../', import.meta.url)) {
  if (!owners.has(owner)) throw new Error(`Unsupported distribution owner: ${owner}`);
  return new URL(`packages/${owner}/dist`, repository);
}
export async function cleanPackageDist(owner, repository) {
  await rm(fileURLToPath(packageDistUrl(owner, repository)), { recursive: true, force: true });
}
// Repository build tooling runs on its pinned Node 24; avoid path-case or
// symlink comparisons when distinguishing CLI execution from test imports.
if (import.meta.main) await cleanPackageDist(process.argv[2]);
