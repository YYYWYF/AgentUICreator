import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const profile = process.argv[2];
if (!['clean', 'recovery'].includes(profile)) throw new Error('Select clean or recovery');
const root = fileURLToPath(new URL('.', import.meta.url));
fs.mkdirSync(path.join(root, 'checks'), { recursive: true });
const environment = { ...process.env,
  CREATOR_MODEL_NAME: 'deepseek-v4.1-flash', CREATOR_MODEL_MAX_TOKENS: '32768',
  CREATOR_CONTEXT_MAX_TOKENS: '262144', CREATOR_CONTEXT_KEEP_TOKENS: '12000',
  CREATOR_CONTEXT_SUMMARY_MAX_TOKENS: '8192', CREATOR_MODEL_TIMEOUT_SECONDS: '120',
  CREATOR_MODEL_TEMPERATURE: '0.2', CREATOR_MODEL_OPENCODE_SESSION_HEADER: '1',
  CREATOR_VERIFICATION_MODE: 'static_and_runtime', CREATOR_BEHAVIOR_VERIFICATION_ENABLED: '0',
  CREATOR_HOT_RELOAD: '0', AGENT_UI_TEST_SOURCE_CREATOR: '0', AGENT_UI_QA_FREEZE_PACKAGES: '1',
  AGENT_UI_QA_POINTER_SUFFIX: `-queryopt-${profile}32k`,
};
delete environment.AGENT_UI_QA_SOURCE_RUN;
delete environment.AGENT_UI_QA_PROMPT_FILE;
delete environment.AGENT_UI_QA_SEED_AFTER_STARTUP;
if (profile === 'recovery') environment.AGENT_UI_QA_SOURCE_RUN = path.join(repository,
  'artifacts/creator-resume-20261105/records/case06-inspection-mac-output-32k-2026-11-05T01-16-53-966Z');
const previous = fs.existsSync(path.join(root, 'attempts.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'attempts.json'), 'utf8')) : [];
const attempt = previous.filter(item => item.profile === profile).length + 1;
const log = path.join(root, 'checks', `${profile}-attempt${attempt}-model-live.log`), output = fs.openSync(log, 'wx');
const child = spawn(process.execPath, [
  '--import', path.join(repository, 'packages/creator/node_modules/tsx/dist/loader.mjs'),
  path.join(repository, 'artifacts/creator-windows-20261105/scripts/evaluate.mts'),
  'case06-inspection', `query-optimized-${profile}-32k`,
], { cwd: repository, env: environment, stdio: ['ignore', output, output], windowsHide: true });
console.log(JSON.stringify({ profile, pid: child.pid, log, model: environment.CREATOR_MODEL_NAME, output: 32768 }));
const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
fs.closeSync(output);
const pointer = path.join(repository, 'artifacts/creator-windows-20261105/local-runs', `latest-case06-inspection-queryopt-${profile}32k.json`);
if (fs.existsSync(pointer)) {
  const entry = JSON.parse(fs.readFileSync(pointer, 'utf8'));
  const file = path.join(root, 'attempts.json');
  const attempts = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  const resultFile = path.join(entry.out, 'result.json');
  const result = fs.existsSync(resultFile) ? JSON.parse(fs.readFileSync(resultFile, 'utf8')) : { status: entry.status, seconds: entry.seconds };
  attempts.push({ profile, attempt: attempts.filter(item => item.profile === profile).length + 1,
    record: path.basename(entry.out), status: result.status, seconds: result.seconds, toolCalls: result.toolCalls });
  fs.writeFileSync(file, JSON.stringify(attempts, null, 2) + '\n');
}
console.log(JSON.stringify({ profile, exitCode: code }));
process.exitCode = typeof code === 'number' ? code : 1;
