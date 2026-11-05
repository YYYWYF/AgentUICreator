import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = process.argv[5] ? path.resolve(process.argv[5]) : path.dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(await fs.readFile(path.join(root, 'baseline.json'), 'utf8'));
const question = process.argv[2];
if (!/^q[1-5]$/.test(question ?? '')) throw Error('Expected q1 to q5');
const dir = path.join(root, question, process.argv[4] ?? '');
const submission = JSON.parse(await fs.readFile(path.join(dir, 'submission.json'), 'utf8'));
const state = path.join(baseline.hostRoot, '.agent-ui/creator');
const candidates = [];
for (const name of await fs.readdir(path.join(state, 'logs'))) {
  if (!name.endsWith('.jsonl')) continue;
  const text = await fs.readFile(path.join(state, 'logs', name), 'utf8');
  const lines = text.trim().split('\n').map(JSON.parse);
  const next = lines.find(line => Date.parse(line.timestamp) >= Date.parse(submission.submittedAt) - 100);
  const delta = Date.parse(next?.timestamp) - Date.parse(submission.submittedAt);
  if (delta >= -500 && delta < 60000) candidates.push({ name, text, lines, delta });
}
candidates.sort((a, b) => a.delta - b.delta);
const log = candidates[0];
if (!log) throw Error('No matching native request');
const runId = log.lines[0].runId;
let events, stream, streamTime = 0;
for (const name of await fs.readdir(path.join(state, 'run-streams'))) {
  const text = await fs.readFile(path.join(state, 'run-streams', name), 'utf8');
  if (!text.includes(runId)) continue;
  const modified = (await fs.stat(path.join(state, 'run-streams', name))).mtimeMs;
  if (modified <= streamTime) continue;
  streamTime = modified;
  stream = text;
  events = text.split('\n').filter(line => line.startsWith('data:')).flatMap(line => {
    try { return [JSON.parse(line.slice(5))]; } catch { return []; }
  });
}
const finish = events?.find(event => event.type === 'RUN_FINISHED')?.result;
const error = events?.find(event => event.type === 'RUN_ERROR');
const receipt = log.lines.filter(event => event.event === 'run_receipt').at(-1);
if (!finish && !error) throw Error('Request is not complete; no evidence archived');
const phaseLines = log.lines.filter(event => Date.parse(event.timestamp) >= Date.parse(submission.submittedAt));
const usage = phaseLines.filter(event => event.event === 'model_result').reduce((sum, event) => ({
  input: sum.input + (event.usage?.input_tokens ?? 0),
  output: sum.output + (event.usage?.output_tokens ?? 0),
  cacheRead: sum.cacheRead + (event.usage?.input_token_details?.cache_read ?? 0),
}), { input: 0, output: 0, cacheRead: 0 });
const hashes = {};
async function walk(dir, relative = '') {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const logical = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) await walk(path.join(dir, entry.name), logical);
    else hashes[logical] = createHash('sha256').update(await fs.readFile(path.join(dir, entry.name))).digest('hex');
  }
}
await walk(path.join(baseline.hostRoot, 'src/agent-ui'));
const previous = question === 'q1' ? baseline.hashes : JSON.parse(await fs.readFile(path.join(root, `q${Number(question.slice(1)) - 1}`, 'summary.json'), 'utf8')).hashes;
const changedPaths = [...new Set([...Object.keys(previous), ...Object.keys(hashes)])].filter(file => previous[file] !== hashes[file]);
const summary = { ...submission, runId, completion: finish?.completion, executionPolicy: finish?.executionPolicy,
  receiptAt: receipt?.timestamp, seconds: receipt ? (Date.parse(receipt.timestamp) - Date.parse(submission.submittedAt)) / 1000 : null,
  toolProtocol: finish?.toolProtocol, completedHandlers: events.filter(event => event.type === 'TOOL_CALL_START').length,
  phaseModelCalls: phaseLines.filter(event => event.event === 'model_result').length,
  toolNames: events.filter(event => event.type === 'TOOL_CALL_START').map(event => event.toolCallName), usage,
  usageScope: 'Main Agent model_result only; routing/provider usage excluded; cacheRead is a subset of input.',
  changedPaths, verification: finish?.receipt?.verification, requestPolicy: log.lines.find(event => event.event === 'request_policy'),
  runError: error, status: process.argv[3], contextCompression: finish?.contextCompression, hashes };
await fs.writeFile(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
await fs.writeFile(path.join(dir, 'native-metrics.jsonl'), log.text);
await fs.writeFile(path.join(dir, 'public-run.sse'), stream);
await fs.writeFile(path.join(dir, 'answer.md'), events.filter(event => event.type === 'TEXT_MESSAGE_CONTENT').map(event => event.delta).join('') + '\n');
await fs.writeFile(path.join(dir, 'native-finish.json'), JSON.stringify(finish ?? error, null, 2));
await fs.cp(path.join(baseline.hostRoot, 'src/agent-ui'), path.join(dir, 'src/agent-ui'), { recursive: true });
console.log(JSON.stringify({ question, seconds: summary.seconds, status: summary.status, completion: summary.completion, tools: summary.toolProtocol, usage, changedPaths }));
