import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { terminateProcessTree } from '../../packages/creator/dist/processTree.js';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const results = [];
for (const value of [undefined, '1']) {
  const root = await mkdtemp(path.join(tmpdir(), 'Creator Playwright 开关-'));
  const token = randomBytes(32).toString('hex');
  const environment = { ...process.env, CREATOR_VERIFICATION_MODE: 'static_and_runtime' };
  delete environment.CREATOR_BEHAVIOR_VERIFICATION_ENABLED;
  if (value !== undefined) environment.CREATOR_BEHAVIOR_VERIFICATION_ENABLED = value;
  const child = spawn(process.execPath, [
    path.join(repository, 'packages/creator/dist/agent/server.js'),
    '--project-root', root, '--skills-root', path.join(repository, 'packages/creator/skills'),
    '--contracts-root', path.join(repository, 'packages/creator/contracts/creator'),
    '--auth-token', token,
  ], { env: environment, detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const port = await new Promise((resolve, reject) => {
      let output = '', errorOutput = '';
      const timer = setTimeout(() => reject(new Error('Creator readiness timed out')), 15000);
      const finish = (error, result) => { clearTimeout(timer); error ? reject(error) : resolve(result); };
      child.once('error', error => finish(error));
      child.once('exit', code => finish(new Error(`Creator exited ${code}: ${errorOutput}`)));
      child.stderr.on('data', chunk => { errorOutput += chunk.toString(); });
      child.stdout.on('data', chunk => {
        output += chunk.toString();
        for (const line of output.split('\n').filter(Boolean)) {
          try { const event = JSON.parse(line); if (event.type === 'creator_ready') finish(undefined, event.port); }
          catch { /* Wait for complete readiness JSON. */ }
        }
      });
    });
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
    });
    assert.equal(response.status, 200);
    const health = await response.json();
    assert.equal(health.behaviorVerificationEnabled, value === '1');
    assert.equal(health.verificationMode, 'static_and_runtime');
    results.push({ environmentValue: value ?? 'unset', behaviorVerificationEnabled: health.behaviorVerificationEnabled,
      verificationMode: health.verificationMode, status: 'passed' });
  } finally {
    await terminateProcessTree(child);
    await rm(root, { recursive: true, force: true });
  }
}
await writeFile(new URL('health.json', import.meta.url), JSON.stringify({ status: 'passed', results,
  scope: 'Built Creator subprocess startup and authenticated health; no model or browser calls. Both subprocesses terminated and temporary projects removed.' }, null, 2) + '\n');
console.log(JSON.stringify({ status: 'passed', processes: results.length, modelCalls: 0 }));
