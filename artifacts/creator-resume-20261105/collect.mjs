import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const runs = fileURLToPath(new URL('../creator-windows-20261105/local-runs/', import.meta.url));
const partial = process.argv.includes('--partial');
const logical = value => value.split(path.sep).join('/');
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const output = async (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n');
const sha = value => createHash('sha256').update(value).digest('hex');
const cases = [
  'case01-cards', 'case03-message-actions', 'case04-help-actions', 'case05-order',
  'case06-inspection', 'case07-sales', 'case08-progress',
];
const inputs = [
  ...cases.map(id => ({ id, suffix: 'resume262k' })),
  ...['case07-sales', 'case04-help-actions'].map(id => ({ id, suffix: 'feedback262k' })),
  ...['case05-order', 'case06-inspection'].map(id => ({ id, suffix: 'retry262k' })),
  { id: 'case06-inspection', suffix: 'output32k' },
  { id: 'case06-inspection', suffix: 'diagnostic-repair32k' },
  { id: 'case06-inspection', suffix: 'running-repair32k' },
  { id: 'case06-inspection', suffix: 'fresh-recovery32k' },
  { id: 'case06-inspection', suffix: 'final-clean32k' },
];
const records = [];
await mkdir(path.join(root, 'records'), { recursive: true });
for (const { id, suffix } of inputs) {
  const pointer = await json(path.join(runs, `latest-${id}-${suffix}.json`)).catch(() => undefined);
  if (!['finished', 'HARNESS_ERROR'].includes(pointer?.status)) {
    if (!partial) throw Error(`${id}-${suffix} has not completed`);
    continue;
  }
  const source = pointer.out;
  const destination = path.join(root, 'records', path.basename(source));
  await mkdir(destination, { recursive: true });
  const files = await readdir(source, { withFileTypes: true });
  for (const entry of files) {
    if (entry.isFile() && /\.(json|jsonl|png)$/u.test(entry.name)) {
      await cp(path.join(source, entry.name), path.join(destination, entry.name));
    }
  }
  // Keep generated source and observable run evidence, never local Host data,
  // model credentials, process profiles or a duplicate SSE transcript.
  await cp(path.join(source, 'host/src'), path.join(destination, 'host/src'), { recursive: true }).catch(error => { if (error.code !== 'ENOENT') throw error; });
  const result = await json(path.join(source, 'result.json')).catch(async error => { if (error.code !== 'ENOENT') throw error; return { ...await json(path.join(source, 'harness-error.json')), caseId: id }; });
  const qualifications = [];
  for (const file of ['qa-invalidation.json', 'qa-stop-request.json', 'qa-selector-mismatch.json']) {
    const note = await json(path.join(source, file)).catch(error => { if (error.code !== 'ENOENT') throw error; return undefined; });
    if (note) qualifications.push({ file, ...note });
  }
  const environment = await json(path.join(source, 'environment.json'));
  const requests = await json(path.join(source, 'model-http-requests.json'));
  const events = (await readFile(path.join(source, 'events-timed.jsonl'), 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return ''; })).trim().split('\n').filter(Boolean).map(JSON.parse);
  const starts = new Map(events.filter(row => row.event.type === 'TOOL_CALL_START').map(row => [row.event.toolCallId, row]));
  const mutations = new Set(['create_ui_plugin', 'create_ui_source_file', 'delete_ui_source_file', 'mutate_ui_plugin_source', 'mutate_app_ui_model', 'edit_file', 'edit_file_from_read']);
  let firstMutation;
  let unavailableChecks = 0;
  const validationAttempts = [];
  for (const row of events) {
    if (row.event.type !== 'TOOL_CALL_RESULT') continue;
    let value; try { value = JSON.parse(row.event.content); } catch { continue; }
    if (value.error?.code === 'PLUGIN_BEHAVIOR_INFRASTRUCTURE_UNAVAILABLE') unavailableChecks++;
    const start = starts.get(row.event.toolCallId);
    if (start?.event.toolCallName === 'validate_creator_changes') validationAttempts.push({
      seconds: row.seconds, status: value.result?.status ?? value.error?.code, revision: value.result?.revision,
      introducedStaticCodes: [...new Set((value.result?.introduced?.staticErrors ?? []).map(issue => issue.code))],
      introducedTypeErrors: value.result?.introduced?.typeErrors?.length,
    });
    if (!firstMutation && start && mutations.has(start.event.toolCallName) && value.ok &&
      (value.result?.revision > 0 || value.result?.changed === true || value.result?.changedPaths?.length > 0)) {
      firstMutation = { tool: start.event.toolCallName, startSeconds: start.seconds, resultSeconds: row.seconds };
    }
  }
  const usage = requests.reduce((total, request) => ({
    input: total.input + (request.usage?.prompt_tokens ?? 0),
    output: total.output + (request.usage?.completion_tokens ?? 0),
    total: total.total + (request.usage?.total_tokens ?? 0),
    missingResponses: total.missingResponses + (request.usage ? 0 : 1),
  }), { input: 0, output: 0, total: 0, missingResponses: 0 });
  const record = {
    id, kind: suffix === 'resume262k' ? 'original-task' : suffix === 'retry262k' ? 'service-retry' : suffix === 'output32k' ? 'output-budget-comparison' : suffix === 'final-clean32k' ? 'final-clean-original-task' : /(?:repair|recovery)32k$/u.test(suffix) ? 'engineering-repair-original-prompt' : 'feedback-repair',
    record: logical(path.relative(root, destination)), nativeStatus: result.status, qualifications,
    configuration: { model: environment.model, context: environment.context, output: environment.output, timeout: environment.timeout },
    seconds: result.seconds, toolCalls: result.toolCalls, modelHttpRequests: requests.length,
    toolCounts: Object.fromEntries([...new Set([...starts.values()].map(row => row.event.toolCallName))].map(name => [name, [...starts.values()].filter(row => row.event.toolCallName === name).length])),
    modelPurposes: Object.fromEntries(['agent', 'routing', 'summary'].map(purpose => [purpose, requests.filter(request => request.purpose === purpose).length])),
    models: [...new Set(requests.map(request => request.returnedModel).filter(Boolean))],
    usage, contextCompression: result.finish?.contextCompression ?? result.runErrors?.at(-1)?.metadata?.contextCompression, firstSuccessfulMutation: firstMutation,
    responseLimits: {
      lengthStops: requests.filter(request => request.finishReason === 'length').length,
      maxInput: Math.max(0, ...requests.map(request => request.usage?.prompt_tokens ?? 0)),
      maxOutput: Math.max(0, ...requests.map(request => request.usage?.completion_tokens ?? 0)),
      maxReasoning: Math.max(0, ...requests.map(request => request.usage?.completion_tokens_details?.reasoning_tokens ?? 0)),
    },
    changedSourceFiles: result.changedPaths?.length, validationAttempts, unavailableNativeBehaviorChecks: unavailableChecks,
    externalBrowserStatus: result.interaction?.status,
    externalChecks: result.interaction?.checks?.map(({ name, status }) => ({ name, status })),
  };
  records.push(record);
  await output(path.join(root, `latest-${id}-${suffix}.json`), { out: record.record, result: { caseId: id } });
}
const browserRecords = [];
for (const entry of await readdir(runs, { withFileTypes: true })) {
  if (!entry.isDirectory() || !(/-extended-/u.test(entry.name) || /-current-replay$/u.test(entry.name))) continue;
  const source = path.join(runs, entry.name);
  const result = await json(path.join(source, 'result.json')).catch(() => undefined);
  if (!result) continue;
  const destination = path.join(root, 'records', entry.name);
  await mkdir(destination, { recursive: true });
  for (const item of await readdir(source, { withFileTypes: true })) {
    if (item.isFile() && /\.(json|png|log)$/u.test(item.name)) await cp(path.join(source, item.name), path.join(destination, item.name));
  }
  const sourceRun = records.find(record => path.basename(record.record) === path.basename(result.source ?? ''));
  const selectorMismatch = await json(path.join(source, 'qa-selector-mismatch.json')).catch(error => { if (error.code !== 'ENOENT') throw error; return undefined; });
  browserRecords.push({ record: logical(path.relative(root, destination)), status: result.status ?? result.interaction?.status,
    applicability: selectorMismatch ? 'qa-selector-mismatch' : sourceRun?.qualifications?.some(note => note.file === 'qa-invalidation.json') ? 'qa-invalidated-source-change' : sourceRun?.qualifications?.some(note => note.file === 'qa-stop-request.json') ? 'qa-stopped-for-diagnosis' : sourceRun?.nativeStatus === 'RUN_ERROR' && sourceRun.changedSourceFiles === 0 ? 'not-applicable-feature-not-created' : 'applicable',
    checks: result.checks ?? result.interaction?.checks, sourceUnchanged: result.sourceUnchanged, browserErrors: result.browserErrors });
}
await cp(path.join(runs, 'resume-preflight-20261105'), path.join(root, 'checks'), { recursive: true });
const redactions = [];
async function redactAccountLinks(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await redactAccountLinks(file);
    else if (entry.isFile() && /\.(json|jsonl|log)$/u.test(entry.name)) {
      const original = await readFile(file, 'utf8');
      const safe = original.replace(/https:\/\/opencode\.ai\/console\/wrk_[A-Za-z0-9]+\/go/gu, 'https://opencode.ai/console/[workspace]/go');
      if (safe !== original) { await writeFile(file, safe); redactions.push(logical(path.relative(root, file))); }
    }
  }
}
await redactAccountLinks(path.join(root, 'records'));
await redactAccountLinks(path.join(root, 'checks'));
await output(path.join(root, 'redactions.json'), { scope: 'Account-specific billing URLs only. Original local runs remain unchanged; source files, native status and numeric telemetry are unchanged.', files: redactions });
await output(path.join(root, 'summary.json'), {
  completed: records.length === inputs.length, platform: process.platform, node: process.version,
  runCounts: { records: records.length, modelAttemptRuns: records.filter(record => record.modelHttpRequests > 0).length, startupFailuresBeforeModel: records.filter(record => record.nativeStatus === 'HARNESS_ERROR').length },
  rawTelemetryTotals: records.reduce((sum, record) => ({
    nativeSeconds: Number((sum.nativeSeconds + (record.seconds ?? 0)).toFixed(3)),
    toolCalls: sum.toolCalls + (record.toolCalls ?? 0), httpRequests: sum.httpRequests + record.modelHttpRequests,
    inputTokensLowerBound: sum.inputTokensLowerBound + record.usage.input, outputTokensLowerBound: sum.outputTokensLowerBound + record.usage.output,
    missingUsageResponses: sum.missingUsageResponses + record.usage.missingResponses,
  }), { nativeSeconds: 0, toolCalls: 0, httpRequests: 0, inputTokensLowerBound: 0, outputTokensLowerBound: 0, missingUsageResponses: 0 }),
  scope: 'Real Creator tasks and independent browser replays in disposable Hosts using workspace-linked built packages. No fresh install, real business backend, deployment or real Windows acceptance is inferred.',
  tokenAccounting: 'Provider-reported cumulative input/output, including repeated and cached input. Reasoning tokens are already part of output. Missing usage makes totals lower bounds. HTTP counts include routing and schema fallback, distinct from observed tool calls.',
  records, browserRecords,
});
const manifest = {};
async function inventory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await inventory(file);
    else if (entry.isFile() && entry.name !== 'record-manifest.json') manifest[logical(path.relative(root, file))] = sha(await readFile(file));
  }
}
await inventory(root);
await output(path.join(root, 'record-manifest.json'), manifest);
console.log(JSON.stringify({ completed: records.length === inputs.length, runRecords: records.length, modelRuns: records.filter(record => record.modelHttpRequests > 0).length, browserRecords: browserRecords.length, files: Object.keys(manifest).length }));
