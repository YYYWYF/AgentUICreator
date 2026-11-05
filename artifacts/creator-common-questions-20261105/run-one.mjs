import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const repository = fileURLToPath(new URL('../../', import.meta.url));
const questions = JSON.parse(fs.readFileSync(path.join(root, 'questions.json'), 'utf8'));
const id = process.argv[2] ?? questions[0].id;
const question = questions.find(item => item.id === id);
if (!question) throw Error('Unknown question');
const started = Date.now(), label = 'single-review-' + new Date().toISOString().replace(/[:.]/g, '-');
const directory = path.join(root, label); fs.mkdirSync(directory);
const output = fs.openSync(path.join(directory, 'harness.log'), 'wx');
const environment = { ...process.env,
  CREATOR_MODEL_NAME: 'deepseek-v4.1-flash', CREATOR_MODEL_MAX_TOKENS: '32768',
  CREATOR_CONTEXT_MAX_TOKENS: '262144', CREATOR_CONTEXT_KEEP_TOKENS: '12000',
  CREATOR_CONTEXT_SUMMARY_MAX_TOKENS: '8192', CREATOR_MODEL_TIMEOUT_SECONDS: '120',
  CREATOR_MODEL_TEMPERATURE: '0.2', CREATOR_MODEL_OPENCODE_SESSION_HEADER: '1',
  CREATOR_VERIFICATION_MODE: 'static_and_runtime', CREATOR_BEHAVIOR_VERIFICATION_ENABLED: '0',
  CREATOR_HOT_RELOAD: '0', AGENT_UI_TEST_SOURCE_CREATOR: '0', AGENT_UI_QA_FREEZE_PACKAGES: '1',
  AGENT_UI_QA_CASES_FILE: path.join(root, 'questions.json'), AGENT_UI_QA_SINGLE_TURN: '1',
  AGENT_UI_QA_FRESH_PROJECT: '1', AGENT_UI_QA_POINTER_SUFFIX: '-common32k',
};
for (const name of ['AGENT_UI_QA_SOURCE_RUN', 'AGENT_UI_QA_PROMPT_FILE', 'AGENT_UI_QA_SEED_AFTER_STARTUP']) delete environment[name];
const child = spawn(process.execPath, ['--import', path.join(repository, 'packages/creator/node_modules/tsx/dist/loader.mjs'),
  path.join(repository, 'artifacts/creator-windows-20261105/scripts/evaluate.mts'), id, label], {
  cwd: repository, env: environment, stdio: ['ignore', output, output], windowsHide: true,
});
console.log(JSON.stringify({ question: question.prompt, pid: child.pid, log: path.join(directory, 'harness.log') }));
const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); }); fs.closeSync(output);
const pointer = JSON.parse(fs.readFileSync(path.join(repository, 'artifacts/creator-windows-20261105/local-runs', `latest-${id}-common32k.json`), 'utf8'));
const source = pointer.out;
for (const entry of fs.readdirSync(source, { withFileTypes: true })) if (entry.isFile() && /\.(json|jsonl|png)$/u.test(entry.name)) fs.copyFileSync(path.join(source, entry.name), path.join(directory, entry.name));
if (fs.existsSync(path.join(source, 'host/src'))) fs.cpSync(path.join(source, 'host/src'), path.join(directory, 'host/src'), { recursive: true });
const read = (name, fallback) => fs.existsSync(path.join(directory, name)) ? JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')) : fallback;
const result = read('result.json', read('harness-error.json', {}));
const events = fs.existsSync(path.join(directory, 'events-timed.jsonl')) ? fs.readFileSync(path.join(directory, 'events-timed.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
const messages = new Map();
for (const {event} of events) {
  if (event.type === 'TEXT_MESSAGE_START' && event.role === 'assistant') messages.set(event.messageId, { text: '', complete: false });
  const message = messages.get(event.messageId);
  if (event.type === 'TEXT_MESSAGE_CONTENT' && message) message.text += event.delta;
  if (event.type === 'TEXT_MESSAGE_END' && message) message.complete = true;
}
const answer = [...messages.values()].filter(item => item.complete && item.text.trim()).at(-1)?.text ?? '';
fs.writeFileSync(path.join(directory, 'answer.md'), answer + '\n');
const requests = read('model-http-requests.json', []);
const summary = { question: question.prompt, status: result.status, secondsFromSubmitToComplete: result.seconds,
  harnessWallSeconds: Number(((Date.now() - started) / 1000).toFixed(3)), toolCalls: result.toolCalls ?? events.filter(row => row.event.type === 'TOOL_CALL_START').length,
  modelHttpRequests: requests.length, model: 'deepseek-v4.1-flash', outputBudget: 32768,
  usage: requests.reduce((sum, item) => ({ input: sum.input + (item.usage?.prompt_tokens ?? 0), output: sum.output + (item.usage?.completion_tokens ?? 0), missingResponses: sum.missingResponses + (item.usage ? 0 : 1) }), { input: 0, output: 0, missingResponses: 0 }),
  changedPaths: result.changedPaths, browserErrors: result.browserErrors, answerFile: 'answer.md',
  approvalPolicy: 'No simulated approval or follow-up; stop at first reply or question. Only one question was submitted.',
};
fs.writeFileSync(path.join(directory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'latest.json'), JSON.stringify({ id, directory: path.basename(directory), summary }, null, 2) + '\n');
console.log(JSON.stringify({ directory, ...summary, answer }, null, 2));
process.exitCode = typeof code === 'number' ? code : 1;
