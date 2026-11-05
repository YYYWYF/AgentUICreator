import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const local = fileURLToPath(new URL('../creator-windows-20261105/local-runs/', import.meta.url));
const baselineRoot = fileURLToPath(new URL('../creator-resume-20261105/', import.meta.url));
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const save = async (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const logical = value => value.split(path.sep).join('/');
for (const profile of ['clean', 'recovery']) {
  const pointer = await json(path.join(local, `latest-case06-inspection-queryopt-${profile}32k.json`));
  if (!['finished', 'HARNESS_ERROR'].includes(pointer.status)) throw new Error(`Model profile still active: ${profile}`);
}
const attempts = await json(path.join(root, 'attempts.json'));
const records = [];
const baseline = await json(path.join(baselineRoot, 'summary.json'));
await mkdir(path.join(root, 'records'), { recursive: true });
for (const attempt of attempts) {
  if (path.basename(attempt.record) !== attempt.record) throw new Error('Invalid record name');
  const source = path.join(local, attempt.record), destination = path.join(root, 'records', attempt.record);
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.isFile() && /\.(json|jsonl|png)$/u.test(entry.name)) await cp(path.join(source, entry.name), path.join(destination, entry.name));
  }
  await cp(path.join(source, 'host/src'), path.join(destination, 'host/src'), { recursive: true }).catch(error => { if (error.code !== 'ENOENT') throw error; });
  const result = await json(path.join(source, 'result.json')).catch(async error => {
    if (error.code !== 'ENOENT') throw error;
    return json(path.join(source, 'harness-error.json'));
  });
  const environment = await json(path.join(source, 'environment.json'));
  const requests = await json(path.join(source, 'model-http-requests.json'));
  const rows = (await readFile(path.join(source, 'events-timed.jsonl'), 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return ''; })).trim().split('\n').filter(Boolean).map(JSON.parse);
  const calls = new Map(); let firstMutation, firstCompositionMutation;
  for (const row of rows) {
    const event = row.event;
    if (event.type === 'TOOL_CALL_START') calls.set(event.toolCallId, { seconds: row.seconds, name: event.toolCallName, args: '' });
    if (event.type === 'TOOL_CALL_ARGS') calls.get(event.toolCallId).args += event.delta;
    if (event.type === 'TOOL_CALL_RESULT') {
      const call = calls.get(event.toolCallId); let value; try { value = JSON.parse(event.content); } catch { continue; }
      if (!firstCompositionMutation && call?.name === 'mutate_app_ui_model' && value.ok && value.result?.changed === true) firstCompositionMutation = { startSeconds: call.seconds, resultSeconds: row.seconds };
      if (!firstMutation && /^(?:create_|delete_|edit_|mutate_)/u.test(call?.name ?? '') && value.ok && value.result?.revision > 0) firstMutation = { tool: call.name, startSeconds: call.seconds, resultSeconds: row.seconds };
    }
  }
  for (const call of calls.values()) { try { call.input = JSON.parse(call.args); } catch { call.input = {}; } delete call.args; }
  const before = baseline.records.find(entry => attempt.profile === 'clean'
    ? entry.kind === 'final-clean-original-task'
    : entry.record.includes('case06-inspection-mac-fresh-recovery-original-'));
  const oldEnvironment = await json(path.join(baselineRoot, before.record, 'environment.json'));
  const oldHashes = await json(path.join(baselineRoot, before.record, 'before-hashes.json'));
  const newHashes = await json(path.join(source, 'before-hashes.json')).catch(error => { if (error.code !== 'ENOENT') throw error; return undefined; });
  const sourceNames = [...new Set([...Object.keys(oldHashes), ...Object.keys(newHashes ?? {})])].filter(name => name.startsWith('src/agent-ui/')).sort();
  const seedIdentity = { baseline: `../creator-resume-20261105/${before.record}`, files: newHashes ? sourceNames.length : null, seedVerification: newHashes ? "compared" : "not reached before QA setup failure",
    differences: !newHashes ? null : sourceNames.filter(name => oldHashes[name] !== newHashes?.[name]),
    originalPromptIdentical: oldEnvironment.prompt === environment.prompt,
    outputBudgetIdentical: oldEnvironment.output === environment.output,
    modelIdentical: oldEnvironment.model === environment.model };
  await save(path.join(destination, 'comparison-input-proof.json'), seedIdentity);
  const usage = requests.reduce((sum, request) => ({ input: sum.input + (request.usage?.prompt_tokens ?? 0), output: sum.output + (request.usage?.completion_tokens ?? 0),
    missingResponses: sum.missingResponses + (request.usage ? 0 : 1) }), { input: 0, output: 0, missingResponses: 0 });
  const validators = rows.filter(row => row.event.type === 'TOOL_CALL_RESULT' && calls.get(row.event.toolCallId)?.name === 'validate_creator_changes').map(row => {
    const value = JSON.parse(row.event.content); return { seconds: row.seconds, status: value.result?.status ?? value.error?.code,
      registryFresh: value.result?.registryFresh, pluginStates: value.result?.pluginStates, introduced: value.result?.introduced };
  });
  const snapshot = await json(path.join(source, 'package-snapshot.json')).catch(error => { if (error.code !== 'ENOENT') throw error; return undefined; });
  records.push({ ...attempt,
    packageSnapshot: snapshot ? { unchanged: snapshot.unchanged, cleaned: snapshot.cleaned, packageVersions: Object.fromEntries(Object.entries(snapshot.packages).map(([name, data]) => [name, data.version])) } : undefined, record: 'records/' + attempt.record, originalInputProof: seedIdentity,
    nativeStatus: result.status, seconds: result.seconds, toolCalls: result.toolCalls ?? calls.size, changedSourceFiles: result.changedPaths?.length,
    firstSuccessfulMutation: firstMutation, firstCompositionMutation, usage, modelHttpRequests: requests.length,
    providerTransportErrors: requests.filter(request => request.error && !request.finishReason).length,
    closedAfterCompletedResponse: requests.filter(request => request.error && request.finishReason).length,
    providerStatusErrors: requests.filter(request => request.status >= 400 || request.streamError).length,
    httpSeconds: Number(requests.reduce((sum, request) => sum + (request.seconds ?? 0), 0).toFixed(3)),
    successfulResponseHeaderSeconds: Number(requests.filter(request => request.status === 200 && request.finishReason).reduce((sum, request) => sum + (request.headersSeconds ?? 0), 0).toFixed(3)),
    models: [...new Set(requests.map(request => request.returnedModel).filter(Boolean))],
    toolCounts: Object.fromEntries([...new Set([...calls.values()].map(call => call.name))].map(name => [name, [...calls.values()].filter(call => call.name === name).length])),
    generatedRegistryReadCalls: [...calls.values()].filter(call => /^(?:read_file|grep|glob|ls)$/u.test(call.name) && /registry\.generated/u.test(JSON.stringify(call.input))).length,
    validationAttempts: validators, externalBrowserStatus: result.interaction?.status,
    qualification: attempt.qualification ?? (result.status === 'RUN_ERROR' ? 'Native run failed; retain actual saved changes and subsequent browser evidence separately. No successful-run speedup is inferred.' : undefined),
    baseline: { record: seedIdentity.baseline, seconds: before.seconds, tools: before.toolCalls, usage: before.usage, firstSuccessfulMutation: before.firstSuccessfulMutation },
  });
}
const browserRecords = [];
for (const entry of await readdir(local, { withFileTypes: true })) {
  if (!entry.isDirectory() || !(/-extended-/u.test(entry.name) || /-replay$/u.test(entry.name))) continue;
  const directory = path.join(local, entry.name);
  const result = await json(path.join(directory, 'result.json')).catch(error => { if (error.code !== 'ENOENT') throw error; return undefined; });
  if (!result || !attempts.some(attempt => attempt.record === path.basename(result.source ?? ''))) continue;
  const destination = path.join(root, 'records', entry.name); await mkdir(destination, { recursive: true });
  for (const file of await readdir(directory, { withFileTypes: true })) if (file.isFile() && /\.(json|png|log)$/u.test(file.name)) await cp(path.join(directory, file.name), path.join(destination, file.name));
  const browserSnapshot = await json(path.join(directory, 'package-snapshot.json')).catch(error => { if (error.code !== 'ENOENT') throw error; return undefined; });
  const modelSnapshot = await json(path.join(result.source, 'package-snapshot.json')).catch(error => { if (error.code !== 'ENOENT') throw error; return undefined; });
  const packageDifferences = browserSnapshot && modelSnapshot ? Object.fromEntries(Object.keys(modelSnapshot.packages).map(name => {
    const before = modelSnapshot.packages[name].hashes, after = browserSnapshot.packages[name]?.hashes ?? {};
    return [name, [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(file => before[file] !== after[file])];
  }).filter(([, files]) => files.length)) : undefined;
  browserRecords.push({ record: 'records/' + entry.name, source: path.basename(result.source), status: result.status ?? result.interaction?.status,
    packageSnapshot: browserSnapshot ? { unchanged: browserSnapshot.unchanged, cleaned: browserSnapshot.cleaned, packageDifferencesFromModel: packageDifferences } : undefined,
    checks: result.checks ?? result.interaction?.checks, sourceUnchanged: result.sourceUnchanged, browserErrors: result.browserErrors, consoleErrors: result.consoleErrors });
}
const redactions = [];
async function redact(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await redact(file);
    else if (entry.isFile() && /\.(json|jsonl|log)$/u.test(entry.name)) {
      const original = await readFile(file, 'utf8'), safe = original.replace(/https:\/\/opencode\.ai\/console\/wrk_[A-Za-z0-9]+\/go/gu, 'https://opencode.ai/console/[workspace]/go');
      if (safe !== original) { await writeFile(file, safe); redactions.push(logical(path.relative(root, file))); }
    }
  }
}
await redact(path.join(root, 'records')); await redact(path.join(root, 'checks'));
await save(path.join(root, 'redactions.json'), { scope: 'Account-specific billing links only; no model credentials or private reasoning bodies are collected.', files: redactions });
const aggregate = records.reduce((sum, record) => ({ recordedSeconds: sum.recordedSeconds + (record.seconds ?? 0), toolCalls: sum.toolCalls + record.toolCalls, input: sum.input + record.usage.input, output: sum.output + record.usage.output, missingUsageResponses: sum.missingUsageResponses + record.usage.missingResponses }), { recordedSeconds: 0, toolCalls: 0, input: 0, output: 0, missingUsageResponses: 0 });
aggregate.recordedSeconds = Number(aggregate.recordedSeconds.toFixed(3));
await save(path.join(root, 'summary.json'), { aggregate, platform: process.platform, node: process.version,
  configuration: { model: 'deepseek-v4.1-flash', output: 32768, context: 262144, keep: 12000, timeout: 120, behaviorVerificationEnabled: false },
  comparisonConditions: 'Exact original prompt and Agent UI source hashes are compared per record. Previous baselines predate the Playwright opt-in switch; the user requested it disabled now. Neither selected baseline actually invoked the behavior tool. No causal speedup or cross-platform acceptance follows from a single stochastic run.',
  tokenAccounting: 'Provider-reported cumulative input/output, including repeated and cached input. Output already includes reasoning. Missing response usage makes totals lower bounds.', records, browserRecords });
const manifest = {};
async function inventory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await inventory(file);
    else if (entry.isFile() && entry.name !== 'record-manifest.json') manifest[logical(path.relative(root, file))] = digest(await readFile(file));
    else if (!entry.isFile()) throw new Error('Archive must not contain symlinks');
  }
}
await inventory(root); await save(path.join(root, 'record-manifest.json'), manifest);
console.log(JSON.stringify({ records: records.length, browserRecords: browserRecords.length, files: Object.keys(manifest).length }));
