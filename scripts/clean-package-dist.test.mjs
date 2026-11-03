import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { cleanPackageDist, packageDistUrl } from './clean-package-dist.mjs';

test('removes stale distribution files while preserving source and sibling resources', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'clean packages 用户 '));
  const repository = pathToFileURL(root + path.sep);
  try {
    for (const owner of ['core', 'renderer', 'runtime']) {
      const base = path.join(root, 'packages', owner); await mkdir(path.join(base, 'dist/old'), { recursive: true }); await mkdir(path.join(base, 'src'));
      await writeFile(path.join(base, 'src/index.ts'), 'preserved'); await writeFile(path.join(base, 'package.json'), '{}');
      await writeFile(path.join(base, 'dist/old/removed.js'), 'stale'); await writeFile(path.join(base, 'dist/old/removed.js.map'), 'stale map');
      await cleanPackageDist(owner, repository); await cleanPackageDist(owner, repository);
      await assert.rejects(stat(path.join(base, 'dist')), { code: 'ENOENT' });
      assert.equal(await readFile(path.join(base, 'src/index.ts'), 'utf8'), 'preserved'); assert.equal(await readFile(path.join(base, 'package.json'), 'utf8'), '{}');
    }
    await assert.rejects(cleanPackageDist('../outside', repository), /Unsupported distribution owner/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('distribution URLs preserve Windows drives, Unicode, spaces and UNC shares', () => {
  assert.equal(fileURLToPath(packageDistUrl('runtime', new URL('file:///C:/Code%20Root/%E7%94%A8%E6%88%B7/')), { windows: true }), 'C:\\Code Root\\用户\\packages\\runtime\\dist');
  assert.equal(fileURLToPath(packageDistUrl('core', new URL('file://server/share/Code%20Root/')), { windows: true }), '\\\\server\\share\\Code Root\\packages\\core\\dist');
});

test('CLI entry cleans the checkout owning the script from a path with spaces and Unicode', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'build CLI 用户 '));
  try {
    const script = path.join(root, 'scripts/clean-package-dist.mjs'); await mkdir(path.dirname(script));
    await writeFile(script, await readFile(new URL('./clean-package-dist.mjs', import.meta.url)));
    const output = path.join(root, 'packages/core/dist'); await mkdir(output, { recursive: true }); await writeFile(path.join(output, 'stale.js'), 'stale');
    execFileSync(process.execPath, [script, 'core'], { encoding: 'utf8' });
    await assert.rejects(stat(output), { code: 'ENOENT' });
  } finally { await rm(root, { recursive: true, force: true }); }
});
