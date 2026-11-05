import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { once } from "node:events";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { CreatorAgentRuntime, type AgentInput } from "./runner.js";
import { restoreTransaction, sourceRoot, projectCommandPaths, RunActivity, readTransaction, transactionPath } from "./activity.js";
import { readCreatorFileState, replaceCreatorFileAtomically, createCreatorFileAtomically, removeCreatorFile, creatorContentHash } from "./files/creatorFileState.js";
import { requestOperator } from "./operator.js";
import { recordRuntimeEvidence } from "./runtime-evidence.js";
import { CreatorRunStream } from "./runStream.js";
import { agentContracts } from "./contracts.js";

const args = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index]!, process.argv[index + 1]!);
const root = path.resolve(required("--project-root"));
const skills = path.resolve(required("--skills-root"));
const auth = required("--auth-token");
const host = args.get("--host") ?? "127.0.0.1";
const port = Number(args.get("--port") ?? 0);
if (host !== "127.0.0.1" || auth.length < 32 || !Number.isInteger(port) || port < 0 || port > 65535) throw new Error("CREATOR_START_CONFIGURATION_INVALID");
const contracts = args.get("--contracts-root") ?? fileURLToPath(new URL("../contracts/creator/", import.meta.url));
const schemas = await agentContracts(contracts);
const runtime = new CreatorAgentRuntime(root, skills, contracts, args.get("--config-root"));
const COMMAND_JOURNAL = ".agent-ui/creator/control/pending-theme-command.json";
await recoverPendingCommand();
const active = new Map<string, { runId: string; controller: AbortController; marker: string }>();
const streams = new Map<string, CreatorRunStream>();
let locked = false, commandToken: string | undefined;
const stopped = new Map<string, string>();
function required(name: string) { const value = args.get(name); if (!value) throw new Error(`CREATOR_START_ARGUMENT_MISSING: ${name}`); return value; }
function response(res: ServerResponse, status: number, body: unknown) { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); }
async function body(req: IncomingMessage, limit: number) {
  let size = 0; const chunks: Buffer[] = [];
  for await (const chunk of req) { const bytes = Buffer.from(chunk); size += bytes.length; if (size > limit) throw new Error("CREATOR_REQUEST_TOO_LARGE"); chunks.push(bytes); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function authenticated(req: IncomingMessage) {
  const actual = Buffer.from(req.headers.authorization ?? ""); const expected = Buffer.from(`Bearer ${auth}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const server = createServer((req, res) => { void handle(req, res).catch(error => {
  console.error(error instanceof Error ? error.message : "CREATOR_REQUEST_FAILED");
  if (!res.headersSent) response(res, 400, { code: "CREATOR_REQUEST_FAILED", error: error instanceof Error ? error.message : String(error) });
  else res.end();
}); });
async function handle(req: IncomingMessage, res: ServerResponse) {
  if (!authenticated(req)) { response(res, 401, { error: "CREATOR_AUTHENTICATION_FAILED" }); return; }
  if (req.method === "GET" && req.url === "/health") {
    response(res, 200, { status: "ok", runtime: "typescript", projectRoot: root, verificationMode: runtime.verificationMode, behaviorVerificationEnabled: runtime.behaviorVerificationEnabled, phase: `${runtime.mode}-agent`, agentMode: runtime.mode, busy: locked || active.size > 0 || runtime.pending.size > 0 || Boolean(commandToken) }); return;
  }
  const url = new URL(req.url ?? "/", "http://creator.local");
  if (req.method === "GET" && url.pathname === "/creator") {
    const stream = streams.get(url.searchParams.get("runId") ?? "");
    if (!stream || stream.threadId !== url.searchParams.get("threadId")) {
      response(res, 404, { code: "CREATOR_RUN_NOT_FOUND" }); return;
    }
    stream.attach(res, Number(url.searchParams.get("offset") ?? 0)); return;
  }
  if (req.method !== "POST") { response(res, 404, { error: "CREATOR_ROUTE_NOT_FOUND" }); return; }
  if (req.url === "/creator-command-mutation") {
    const input = await body(req, 4096);
    if (input.action === "acquire" && !locked && !commandToken && !runtime.pending.size) {
      commandToken = (await import("node:crypto")).randomUUID(); response(res, 200, { token: commandToken });
    } else if (input.action === "release" && commandToken && input.token === commandToken) { commandToken = undefined; response(res, 200, { released: true }); }
    else response(res, 409, { code: "CREATOR_COMMAND_BUSY" });
    return;
  }
  if (req.url === "/creator-command-commit") {
    const input = await body(req, 262144);
    if (locked || commandToken || runtime.pending.size) { response(res, 409, { code: "CREATOR_COMMAND_BUSY" }); return; }
    locked = true;
    try { response(res, 200, await commandCommit(input)); } finally { locked = false; }
    return;
  }
  if (req.url === "/creator-control") {
    const input = await body(req, 4096);
    if (typeof input.threadId !== "string") throw new Error("CREATOR_THREAD_ID_REQUIRED");
    if (["undo", "reapply"].includes(input.action)) {
      if (locked || commandToken || runtime.pending.size) { response(res, 409, { code: "CREATOR_RUN_ACTIVE" }); return; }
      locked = true;
      try { response(res, 200, await restoreTransaction(root, input.runId, input.action)); } finally { locked = false; }
    } else if (input.action === "abandon") {
      await runtime.abandon(input.threadId, input.interruptId); response(res, 200, { status: "abandoned" });
    } else if (input.action === "stop") {
      const run = active.get(input.threadId);
      if (run && run.runId === input.runId) {
        await mkdir(path.dirname(path.join(root, run.marker)), { recursive: true });
        await writeFile(path.join(root, run.marker), "stop\n");
        run.controller.abort(new Error("CREATOR_RUN_STOPPED")); stopped.set(input.runId, "stopped");
        response(res, 202, { status: "stopping", runId: input.runId });
      } else if (stopped.has(input.runId)) response(res, 200, { status: stopped.get(input.runId) });
      else response(res, 404, { code: "CREATOR_RUN_NOT_FOUND" });
    } else throw new Error("CREATOR_CONTROL_ACTION_INVALID");
    return;
  }
  if (req.url === "/runtime-diagnostics") {
    const input = await body(req, 1_048_576);
    schemas.validate("RuntimeDiagnosticEnvelope", input);
    if (!input || typeof input.threadId !== "string" || Boolean(input.diagnostic) === Boolean(input.composition)) throw new Error("CREATOR_RUNTIME_DIAGNOSTIC_INVALID");
    const evidence = input.diagnostic ?? input.composition;
    if (!evidence || typeof evidence.appUIModelHash !== "string" || !/^[a-f0-9]{64}$/u.test(evidence.appUIModelHash)) throw new Error("CREATOR_RUNTIME_DIAGNOSTIC_INVALID");
    recordRuntimeEvidence(runtime.diagnostics, input);
    response(res, 202, { accepted: true }); return;
  }
  if (req.url === "/visual-observation") {
    const input = await body(req, 1_048_576);
    schemas.validate("VisualObservationEnvelope", input);
    if (!/^[a-f0-9]{64}$/u.test(input.currentHash) || input.image?.format !== "webp" || typeof input.image?.data !== "string") throw new Error("CREATOR_VISUAL_OBSERVATION_INVALID");
    const image = Buffer.from(input.image.data, "base64");
    if (image.length !== input.imageBytes || image.length > 760 * 1024 || image.subarray(0, 4).toString() !== "RIFF" || image.subarray(8, 12).toString() !== "WEBP") throw new Error("CREATOR_VISUAL_OBSERVATION_INVALID");
    const directory = path.join(root, ".agent-ui", "visual-observations", input.currentHash);
    await mkdir(directory, { recursive: true });
    try { await writeFile(path.join(directory, "preview.webp"), image, { flag: "wx" }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    const observation = { currentHash: input.currentHash, capturedAt: input.capturedAt, artifactLocation: path.join(directory, "preview.webp") };
    await writeFile(path.join(directory, "metadata.json"), JSON.stringify(observation)); response(res, 202, { observation }); return;
  }
  if (req.url !== "/creator") { response(res, 404, { error: "CREATOR_ROUTE_NOT_FOUND" }); return; }
  const input: AgentInput = await body(req, 2_097_152);
  if (typeof input.threadId !== "string" || !input.threadId || typeof input.runId !== "string" || !input.runId || !Array.isArray(input.messages)) throw new Error("CREATOR_RUN_INPUT_INVALID");
  const previous = streams.get(input.runId);
  if (previous) {
    if (previous.threadId !== input.threadId || previous.inputHash !== CreatorRunStream.hash(input)) {
      response(res, 409, { code: "CREATOR_RUN_ID_CONFLICT" }); return;
    }
    previous.attach(res); return;
  }
  if (locked || commandToken || (runtime.pending.size > 0 && !runtime.pending.has(input.threadId))) { response(res, 409, { code: "CREATOR_RUN_ACTIVE" }); return; }
  locked = true;
  const controller = new AbortController();
  const marker = `.agent-ui/creator/control/cancel-${(await import("node:crypto")).randomUUID()}`;
  active.set(input.threadId, { runId: input.runId, controller, marker });
  const stream = new CreatorRunStream(input.threadId, input, path.join(root, ".agent-ui/creator/run-streams"));
  streams.set(input.runId, stream);
  stream.attach(res);
  // Execution belongs to this process, not to any of its HTTP subscribers.
  void (async () => {
    try { await runtime.run(input, controller.signal, event => stream.publish(event), marker); }
    catch (error) {
      console.error(error instanceof Error ? error.stack : "CREATOR_RUN_FAILED");
      await stream.publish({ type: "RUN_ERROR", code: controller.signal.aborted ? "CREATOR_RUN_STOPPED" : (error as any)?.code ?? "CREATOR_RUN_FAILED", message: error instanceof Error ? error.message : String(error), ...((error as any)?.creatorMetadata ? { metadata: (error as any).creatorMetadata } : {}) });
    } finally { active.delete(input.threadId); locked = false; stream.finish(); }
  })().catch(error => console.error(error instanceof Error ? error.message : "CREATOR_RUN_FAILED"));
}

async function commandCommit(input: any) {
  if (typeof input.path !== "string" || typeof input.before !== "string" || typeof input.after !== "string" || Object.keys(input).some(key => !["path", "before", "after", "verificationRuntime"].includes(key))) throw new Error("CREATOR_COMMAND_REQUEST_INVALID");
  const source = await sourceRoot(root);
  const projectPaths = await projectCommandPaths(root);
  const allowed = [projectPaths.model];
  if (!allowed.includes(input.path)) throw new Error("CREATOR_COMMAND_PATH_INVALID");
  if (input.path.endsWith("app-ui.json")) {
    let changes = 0;
    const compare = (left: any, right: any) => {
      if (JSON.stringify(left) === JSON.stringify(right)) return;
      if (left && right && typeof left === "object" && typeof right === "object" && !Array.isArray(left) && !Array.isArray(right)) {
        const plugin = typeof left.pluginId === "string";
        if (plugin && (left.enabled ?? true) !== (right.enabled ?? true)) {
          if (typeof (left.enabled ?? true) !== "boolean" || typeof (right.enabled ?? true) !== "boolean") throw new Error("PLUGIN_COMMAND_CHANGE_INVALID"); changes++;
        }
        for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) if (!(plugin && key === "enabled")) compare(left[key], right[key]);
      } else if (Array.isArray(left) && Array.isArray(right) && left.length === right.length) left.forEach((value, index) => compare(value, right[index]));
      else throw new Error("PLUGIN_COMMAND_CHANGE_INVALID");
    };
    compare(JSON.parse(input.before), JSON.parse(input.after));
    if (changes !== 1 && input.before !== input.after) throw new Error("PLUGIN_COMMAND_CHANGE_INVALID");
  }
  const before = await readCreatorFileState(root, input.path);
  if (!before.exists || before.content !== input.before) throw new Error("CREATOR_FILE_STATE_CONFLICT");
  const entry = await readFile(path.join(root, ".agent-ui/operator/entry.mjs"), "utf8");
  const matched = /import \{ runUIOperatorCli \} from ("[^"\n]+");/u.exec(entry);
  if (!matched || JSON.parse(matched[1]!) !== input.verificationRuntime) throw new Error("THEME_VERIFIER_RUNTIME_MISMATCH");
  const verifier = await import(input.verificationRuntime);
  if (input.before === input.after) {
    const verification = await verifier.verifyUIProject(root);
    if (verification.status !== "passed") throw new Error("CREATOR_COMMAND_VALIDATION_FAILED");
    return { verification };
  }
  const edits = [{ path: input.path as string, before, after: input.after as string }];
  if (input.path.endsWith("app-ui.json")) {
    const registry = await verifier.planAgentUIPluginRegistry(root, input.after);
    if (registry.path !== `${source}/plugins/registry.generated.ts`) throw new Error("CREATOR_COMMAND_PATH_INVALID");
    const registryBefore = await readCreatorFileState(root, registry.path);
    if (!registryBefore.exists || registryBefore.content !== registry.before) throw new Error("CREATOR_FILE_STATE_CONFLICT");
    if (registry.before !== registry.after) edits.push({ path: registry.path, before: registryBefore, after: registry.after });
  }
  const { randomUUID } = await import("node:crypto");
  const activity = new RunActivity(root, randomUUID(), new AbortController().signal);
  for (const edit of edits) await activity.capture(edit.path);
  const provisional = { runId: activity.runId, createdAt: new Date().toISOString(), mutationRevision: edits.length, validationRevision: null, files: edits.map(edit => ({ path: edit.path, status: "modified", before: edit.before, after: { exists: true, hash: creatorContentHash(edit.after), content: edit.after } })), createdDirectories: [] };
  await createCreatorFileAtomically(root, transactionPath(activity.runId), JSON.stringify(provisional));
  await createCreatorFileAtomically(root, COMMAND_JOURNAL, JSON.stringify({ runId: activity.runId, ownerPid: process.pid }));
  try {
    for (const edit of edits) {
      await replaceCreatorFileAtomically(root, edit.path, edit.after, edit.before);
      activity.recordAfter(edit.path, { exists: true, hash: creatorContentHash(edit.after), content: edit.after });
      activity.revision++;
    }
    // The command's Operator transaction already owns the project lock. Verify
    // through that exact installed runtime rather than recursively acquiring it.
    const verification = await verifier.verifyUIProject(root);
    if (verification.status !== "passed") throw new Error("CREATOR_COMMAND_VALIDATION_FAILED");
    for (const edit of edits) if ((await readCreatorFileState(root, edit.path)).hash !== creatorContentHash(edit.after)) throw new Error("THEME_CONFIGURATION_CHANGED");
    activity.validationRevision = activity.revision;
    activity.validations.push({ command: "verify_ui_project", status: "passed", exitCode: 0, output: JSON.stringify(verification), truncated: false });
    const receipt = await activity.persist();
    await removeCreatorFile(root, COMMAND_JOURNAL);
    return { runId: activity.runId, verification, receipt };
  } catch (error) {
    await recoverPendingCommand(activity.runId);
    throw error;
  }
}

async function recoverPendingCommand(ownedRun?: string) {
  const saved = await readCreatorFileState(root, COMMAND_JOURNAL);
  if (!saved.exists) return;
  const journal = JSON.parse(saved.content ?? "{}");
  if (Object.keys(journal).sort().join(",") !== "ownerPid,runId" || typeof journal.runId !== "string" || !Number.isSafeInteger(journal.ownerPid) || journal.ownerPid <= 0) throw new Error("THEME_COMMAND_JOURNAL_INVALID");
  if (journal.runId !== ownedRun) {
    try { process.kill(journal.ownerPid, 0); throw new Error("CREATOR_COMMAND_BUSY"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
  }
  const record = await readTransaction(root, journal.runId);
  const source = await sourceRoot(root);
  const paths = record.files.map(file => file.path);
  const { model, registry, settings } = await projectCommandPaths(root);
  const valid = new Set(paths).size === paths.length && (paths.length === 1 && paths[0] === settings ||
    paths.includes(model) && paths.length <= 2 && paths.every(file => file === model || file === registry));
  if (!valid) throw new Error("THEME_COMMAND_JOURNAL_INVALID");
  await restoreTransaction(root, journal.runId, "undo", undefined, { allowPartialUndo: true });
  await removeCreatorFile(root, COMMAND_JOURNAL, saved);
}

server.listen(port, host);
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") throw new Error("CREATOR_START_FAILED");
process.stdout.write(JSON.stringify({ type: "creator_ready", port: address.port }) + "\n");
const parent = Number(args.get("--parent-pid") ?? process.ppid);
const monitor = setInterval(() => { try { process.kill(parent, 0); } catch { for (const run of active.values()) run.controller.abort(); server.close(); clearInterval(monitor); } }, 1000);
monitor.unref();
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { for (const run of active.values()) run.controller.abort(); clearInterval(monitor); server.close(); });
