import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, unlink, appendFile, rmdir, stat } from "node:fs/promises";
import path from "node:path";
import { creatorContentHash as hash, readCreatorFileState as state, replaceCreatorFileAtomically as replace, createCreatorFileAtomically as create, removeCreatorFile as remove, type CreatorFileState } from "./files/creatorFileState.js";
import { CreatorFileObservationStore } from "./files/CreatorFileObservationStore.js";

const DIRECTORY = ".agent-ui/creator/transactions";
const MAX_BYTES = 5_000_000;
const MAX_FILES = 500;
export interface TransactionFile { path: string; status: string; before: CreatorFileState; after: CreatorFileState }
export interface Transaction { runId: string; createdAt: string; mutationRevision: number; validationRevision: number | null; files: TransactionFile[]; createdDirectories?: string[]; unrecoverablePaths?: string[] }

export async function sourceRoot(root: string): Promise<string> {
  const config = JSON.parse(await readFile(path.join(root, ".agent-ui/project.json"), "utf8"));
  const logical = String(config.sourceRoot).replaceAll("\\", "/").replace(/\/+$/u, "");
  if (!logical || logical.startsWith("/") || logical.split("/").includes("..") || logical.includes(":")) throw new Error("CREATOR_SOURCE_ROOT_INVALID");
  return logical;
}

/** Logical project paths for command admission and recovery; no project mutation. */
export async function projectCommandPaths(root: string) {
  const source = await sourceRoot(root);
  const flatModel = `${source}/app-ui.json`, legacyModel = `${source}/app-ui/app-ui.json`;
  const model = (await state(root, flatModel)).exists || !(await state(root, legacyModel)).exists ? flatModel : legacyModel;
  const flatSettings = `${source}/config.ts`, nestedSettings = `${source}/agent-ui/config.ts`;
  const settings = (await state(root, flatSettings)).exists || model === flatModel ? flatSettings
    : (await state(root, nestedSettings)).exists ? nestedSettings : `${source}/agent-ui/theme/theme-config.ts`;
  return { source, model, settings, registry: `${source}/plugins/registry.generated.ts` };
}

export async function walk(root: string, relative: string, limit = 5000, excluded = new Set<string>()): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string) {
    for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
      if (directory.split("/").at(-1) === ".agent-ui" && entry.name === "creator") continue;
      if (entry.isSymbolicLink() || excluded.has(entry.name) || ["node_modules", ".git", ".vite", "dist", "build", "coverage", ".agent-ui", ".agentuicreator"].includes(entry.name) || entry.name.startsWith(".env")) continue;
      const name = path.posix.join(directory, entry.name);
      if (entry.isDirectory()) await visit(name); else if (entry.isFile()) files.push(name);
      if (files.length > limit) throw new Error("CREATOR_FILE_INVENTORY_LIMIT");
    }
  }
  try { await visit(relative); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  return files;
}

export class RunActivity {
  readonly observations: CreatorFileObservationStore;
  readonly before = new Map<string, CreatorFileState>();
  readonly after = new Map<string, CreatorFileState>();
  readonly unrecoverablePaths = new Set<string>();
  readonly createdDirectories = new Set<string>();
  readonly logPath: string;
  private logTail: Promise<void> = Promise.resolve();
  validations: any[] = [];
  readonly recoveries: { runId: string; action: "undo" | "reapply"; changedPaths: string[] }[] = [];
  async recordRecovery(runId: string, action: "undo" | "reapply", changedPaths: string[]) {
    const recovery = { runId, action, changedPaths };
    this.recoveries.push(recovery);
    await this.log("run_recovery", recovery);
  }
  private currentRevision = 0;
  lastMutationAt: string | null = null;
  get revision() { return this.currentRevision; }
  set revision(value: number) { if (value !== this.currentRevision) this.lastMutationAt = new Date().toISOString(); this.currentRevision = value; }
  validationRevision: number | null = null;
  constructor(readonly root: string, readonly runId: string, readonly signal: AbortSignal) {
    this.observations = new CreatorFileObservationStore(root);
    this.observations.begin(runId);
    this.logPath = `.agent-ui/creator/logs/${new Date().toISOString().replaceAll(":", "-")}_${hash(runId)}.jsonl`;
  }
  log(event: string, data: object = {}) {
    this.logTail = this.logTail.then(async () => {
      const name = this.logPath;
      const current = await state(this.root, name);
      const line = JSON.stringify({ timestamp: new Date().toISOString(), runId: this.runId, event, ...data }) + "\n";
      if (current.exists) await replace(this.root, name, (current.content ?? "") + line, current);
      else await create(this.root, name, line);
    });
    return this.logTail;
  }
  async capture(file: string) {
    const name = file.replace(/^\/+/, "");
    const expected = this.after.get(name);
    if (expected) {
      const current = await state(this.root, name);
      if (current.hash !== expected.hash || current.exists !== expected.exists) throw new Error(`CREATOR_RUN_FILE_CHANGED_EXTERNALLY: ${name}`);
    }
    if (!this.before.has(name)) this.before.set(name, await state(this.root, name));
    for (let directory = path.posix.dirname(name); directory !== "."; directory = path.posix.dirname(directory)) {
      try { await stat(path.join(this.root, directory)); break; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; this.createdDirectories.add(directory); }
    }
    if (this.before.size > MAX_FILES || Buffer.byteLength(JSON.stringify([...this.before])) > MAX_BYTES / 2) throw new Error("CREATOR_TRANSACTION_TOO_LARGE");
  }
  recordAfter(file: string, value: CreatorFileState) { this.after.set(file.replace(/^\/+/, ""), value); }
  async captureSource() {
    for (const file of this.after.keys()) await this.capture(file);
    const snapshot = new Map<string, CreatorFileState>();
    const names = [...await walk(this.root, "", 5000), ...await walk(this.root, ".agent-ui", 5000, new Set(["creator", "mocks", "visual-observations", "operator"]))];
    for (const name of [...names, ".agent-ui/project.json", ".agent-ui/source-lock.json", ".agent-ui/plugin-ownership.json"]) snapshot.set(name, await state(this.root, name));
    if (Buffer.byteLength(JSON.stringify([...snapshot])) > MAX_BYTES * 4) throw new Error("CREATOR_TRANSACTION_SNAPSHOT_TOO_LARGE");
    return snapshot;
  }
  async observeOperatorChanges(previous: Map<string, CreatorFileState>, result?: Record<string, any>) {
    if (!result) {
      for (const file of new Set([...previous.keys(), ...await walk(this.root, "", 5000)])) {
        const before = previous.get(file) ?? { exists: false, hash: hash("<missing>") }, current = await state(this.root, file);
        if (before.hash !== current.hash || before.exists !== current.exists) this.unrecoverablePaths.add(file);
      }
      return;
    }
    const names: string[] = Array.isArray(result.changedPaths) ? result.changedPaths : result.changed && typeof result.path === "string" ? [result.path] : [];
    let changed = false;
    for (const name of names) {
      if (name.split("/").some(part => part.startsWith(".env") || ["node_modules", ".git"].includes(part)) || /^\.agent-ui\/(?:creator|mocks|visual-observations|operator)\//u.test(name)) { this.unrecoverablePaths.add(name); continue; }
      const before = previous.get(name) ?? { exists: false, hash: hash("<missing>") }, after = await state(this.root, name);
      if (before.hash === after.hash && before.exists === after.exists) continue;
      if (!this.before.has(name)) this.before.set(name, before);
      this.recordAfter(name, after); changed = true;
    }
    if (changed) this.revision++;
  }
  async persist() {
    const files: TransactionFile[] = [];
    for (const [file, before] of this.before) {
      const after = this.after.get(file);
      if (!after) continue;
      if (after.hash === before.hash && after.exists === before.exists) continue;
      files.push({ path: file, status: !before.exists ? "created" : !after.exists ? "deleted" : "modified", before, after });
    }
    if (files.length || this.unrecoverablePaths.size) {
      const record: Transaction = { runId: this.runId, createdAt: new Date().toISOString(), mutationRevision: this.revision, validationRevision: this.validationRevision, files, createdDirectories: [...this.createdDirectories], ...(this.unrecoverablePaths.size ? { unrecoverablePaths: [...this.unrecoverablePaths] } : {}) };
      let payload = JSON.stringify(record);
      if (files.length > MAX_FILES || Buffer.byteLength(payload) > MAX_BYTES) {
        for (const file of files) this.unrecoverablePaths.add(file.path);
        record.files = []; record.createdDirectories = []; record.unrecoverablePaths = [...this.unrecoverablePaths];
        payload = JSON.stringify(record);
      }
      const name = transactionPath(this.runId);
      const current = await state(this.root, name);
      if (current.exists) await replace(this.root, name, payload, current); else await create(this.root, name, payload);
    }
    const verdict = [...this.validations].reverse().find(v => v.command === "verify_creator_delta") ?? this.validations.at(-1);
    const conflicts = [];
    for (const file of files) {
      const current = await state(this.root, file.path);
      if (current.hash !== file.after.hash || current.exists !== file.after.exists) conflicts.push({ path: file.path, expectedHash: file.after.hash, actualHash: current.hash });
    }
    const verified = !conflicts.length && !this.unrecoverablePaths.size && this.validationRevision === this.revision && verdict?.status === "passed";
    await this.log("run_receipt", { revision: this.revision, validationRevision: this.validationRevision, changedPaths: files.map(file => file.path) });
    const receiptFiles = [...files.map(file => ({ path: file.path, status: file.status, diff: diff(file), truncated: diff(file).length >= 20_000 })), ...[...this.unrecoverablePaths].filter(file => !files.some(item => item.path === file)).map(file => ({ path: file, status: "modified", diff: "CREATOR_RECOVERY_CONTENT_UNAVAILABLE", truncated: false }))];
    return { files: receiptFiles, validations: this.validations,
      diagnosticLog: { format: "jsonl", path: this.logPath },
      transaction: { runId: this.runId, undoable: files.length > 0 && !conflicts.length && !this.unrecoverablePaths.size && files.every(file => !file.before.exists || file.before.content !== undefined), reapplyable: files.length > 0 && !this.unrecoverablePaths.size && files.every(file => !file.after.exists || file.after.content !== undefined), changedPaths: receiptFiles.map(file => file.path), conflicts },
      verification: { status: receiptFiles.length ? verified ? "changed-and-statically-verified" : "changed-unverified" : "no-project-change", projectRevision: this.revision, validationRevision: this.validationRevision, auditAttempts: 0, checks: [], verificationMode: "static_only", runtimeStatus: "not-run" } };
  }
}

function diff(file: TransactionFile) {
  const before = (file.before.content ?? "").split("\n");
  const after = (file.after.content ?? "").split("\n");
  return `--- a/${file.path}\n+++ b/${file.path}\n@@ -1,${before.length} +1,${after.length} @@\n${before.map(line => `-${line}`).join("\n")}\n${after.map(line => `+${line}`).join("\n")}`.slice(0, 20_000);
}

export function transactionPath(runId: string) { return `${DIRECTORY}/${hash(runId)}.json`; }
export async function readTransaction(root: string, runId: string): Promise<Transaction> {
  const value = await state(root, transactionPath(runId));
  if (!value.exists || !value.content || Buffer.byteLength(value.content) > MAX_BYTES) throw new Error("CREATOR_TRANSACTION_NOT_FOUND");
  const record: Transaction = JSON.parse(value.content);
  if (record.runId !== runId || !Array.isArray(record.files) || record.files.length > MAX_FILES || !Number.isInteger(record.mutationRevision)) throw new Error("CREATOR_TRANSACTION_INVALID");
  const names = new Set<string>();
  for (const file of record.files) {
    if (!file.path || /\\|\x00|:/u.test(file.path) || file.path.startsWith("/") || file.path.split("/").includes("..") || names.has(file.path)) throw new Error("CREATOR_TRANSACTION_INVALID");
    names.add(file.path);
    for (const version of [file.before, file.after]) {
      if (!version || typeof version.exists !== "boolean" || !/^[a-f0-9]{64}$/u.test(version.hash) || (version.content !== undefined && hash(version.content) !== version.hash)) throw new Error("CREATOR_TRANSACTION_INVALID");
      if (!version.exists && (version.hash !== hash("<missing>") || version.content !== undefined)) throw new Error("CREATOR_TRANSACTION_INVALID");
    }
  }
  if (record.createdDirectories !== undefined && (!Array.isArray(record.createdDirectories) || record.createdDirectories.some(directory => typeof directory !== "string" || !directory || /[\\:\x00]/u.test(directory) || directory.startsWith("/") || directory.split("/").includes("..") || !record.files.some(file => file.path.startsWith(directory + "/"))))) throw new Error("CREATOR_TRANSACTION_INVALID");
  if (record.unrecoverablePaths !== undefined && (!Array.isArray(record.unrecoverablePaths) || record.unrecoverablePaths.length > 5000 || record.unrecoverablePaths.some(file => typeof file !== "string" || !file || /[\\:\x00]/u.test(file) || file.startsWith("/") || file.split("/").includes("..")))) throw new Error("CREATOR_TRANSACTION_INVALID");
  return record;
}

// The server holds its project mutation lock for the entire operation. Preflight
// every file before writing, and restore partial writes on a failed commit.
export async function restoreTransaction(root: string, runId: string, action: "undo" | "reapply", signal?: AbortSignal, options: { allowPartialUndo?: boolean } = {}) {
  const record = await readTransaction(root, runId);
  if (record.unrecoverablePaths?.length) throw new Error("CREATOR_TRANSACTION_CONTENT_UNAVAILABLE");
  const snapshots = new Map<string, CreatorFileState>();
  const beforeKey = action === "undo" ? "after" : "before";
  const targetKey = action === "undo" ? "before" : "after";
  const marker = `${transactionPath(runId)}.undone`;
  const markerState = await state(root, marker);
  if ((action === "undo" && markerState.exists) || (action === "reapply" && !markerState.exists)) {
    for (const file of record.files) {
      const current = await state(root, file.path), expected = file[targetKey];
      if (current.hash !== expected.hash || current.exists !== expected.exists) throw new Error(`CREATOR_UNDO_CONFLICT: ${file.path}`);
    }
    return { status: action === "undo" ? "undone" : "reapplied", runId, changedPaths: [], reapplyable: record.files.every(file => !file.after.exists || file.after.content !== undefined) };
  }
  for (const file of record.files) {
    const current = await state(root, file.path);
    const alreadyRestored = action === "undo" && options.allowPartialUndo && current.hash === file.before.hash && current.exists === file.before.exists;
    if (!alreadyRestored && (current.hash !== file[beforeKey].hash || current.exists !== file[beforeKey].exists)) throw new Error(`CREATOR_UNDO_CONFLICT: ${file.path}`);
    if (file[targetKey].exists && file[targetKey].content === undefined) throw new Error("CREATOR_TRANSACTION_CONTENT_UNAVAILABLE");
    snapshots.set(file.path, current);
  }
  const changed: string[] = [];
  try {
    for (const file of record.files) {
      signal?.throwIfAborted();
      const target = file[targetKey];
      const current = snapshots.get(file.path)!;
      if (current.hash === target.hash && current.exists === target.exists) continue;
      if (!target.exists) await remove(root, file.path, current);
      else if (current.exists) await replace(root, file.path, target.content!, current);
      else await create(root, file.path, target.content!);
      changed.push(file.path);
    }
    if (action === "undo") await create(root, marker, JSON.stringify({ runId, createdAt: new Date().toISOString(), id: randomUUID() }));
    else await remove(root, marker, markerState);
  } catch (error) {
    for (const file of changed.reverse()) {
      const original = snapshots.get(file)!;
      const current = await state(root, file);
      if (!original.exists) await remove(root, file, current);
      else if (current.exists) await replace(root, file, original.content!, current);
      else await create(root, file, original.content!);
    }
    throw error;
  }
  if (action === "undo") for (const directory of [...(record.createdDirectories ?? [])].sort((a, b) => b.length - a.length)) {
    // Directory cleanup is best effort after the file transaction is committed.
    await rmdir(path.join(root, directory)).catch(() => undefined);
  }
  return { status: action === "undo" ? "undone" : "reapplied", runId, changedPaths: changed, reapplyable: record.files.every(file => !file.after.exists || file.after.content !== undefined) };
}
