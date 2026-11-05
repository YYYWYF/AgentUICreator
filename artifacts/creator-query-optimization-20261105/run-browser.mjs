import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const repository = fileURLToPath(new URL('../../', import.meta.url));
const profile = process.argv[2];
if (!['clean', 'recovery'].includes(profile)) throw Error('Select clean or recovery');
const attempts = JSON.parse(fs.readFileSync(path.join(root, 'attempts.json'), 'utf8'));
const attempt = attempts.findLast(item => item.profile === profile);
if (attempt?.status !== 'success' || attempt.qualification) throw Error('Latest attempt is not an unqualified native success');
for (const stage of ['replay', 'extended']) {
  const log = path.join(root, 'checks', `${profile}-attempt${attempt.attempt}-${stage}-frozen.log`);
  const output = fs.openSync(log, 'wx');
  const child = spawn(process.execPath, ['--import', path.join(repository, 'packages/creator/node_modules/tsx/dist/loader.mjs'),
    path.join(repository, 'artifacts/creator-windows-20261105/scripts', stage === 'replay' ? 'replay-scenario.mts' : 'verify-extended.mts'),
    stage === 'replay' ? `case06-inspection-queryopt-${profile}-attempt${attempt.attempt}-frozen` : 'case06-inspection'], {
    cwd: repository, env: { ...process.env, AGENT_UI_QA_FREEZE_PACKAGES: '1', AGENT_UI_QA_SOURCE_RUN: path.join(repository, 'artifacts/creator-windows-20261105/local-runs', attempt.record) },
    stdio: ['ignore', output, output], windowsHide: true,
  });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  fs.closeSync(output);
  console.log(JSON.stringify({ profile, attempt: attempt.attempt, stage, exitCode: code, log }));
  if (code !== 0) { process.exitCode = 1; break; }
}
