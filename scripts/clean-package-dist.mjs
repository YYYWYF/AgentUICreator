import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

const owners = new Set(['core', 'renderer', 'runtime']);
export function packageDistUrl(owner, repository = new URL('../', import.meta.url)) {
  if (!owners.has(owner)) throw new Error(`Unsupported distribution owner: ${owner}`);
  return new URL(`packages/${owner}/dist`, repository);
}
export async function cleanPackageDist(owner, repository) {
  await rm(fileURLToPath(packageDistUrl(owner, repository)), { recursive: true, force: true });
}
// Node 22.0 has no import.meta.main; resolve both native paths for case/symlink identity.
const main = import.meta.main ?? (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)));
if (main) await cleanPackageDist(process.argv[2]);
