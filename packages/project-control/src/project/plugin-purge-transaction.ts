import { randomUUID } from "node:crypto";
import { mkdir, writeFile, rename, unlink, link, rmdir } from "node:fs/promises";
import path from "node:path";
import { readOptionalBuffer } from "./source-registry/lock";
import { assertNoSymbolicLinkTraversal, assertSafeProjectRelativePath, AgentUISourceError } from "./source-registry/path-policy";

import { readAgentUIProjectConfig } from "./project-mode";
import { resolveAgentUIProjectPaths, projectRelativePath } from "./agent-ui-project-paths";

export const PURGE_JOURNAL = ".agentuicreator/control/pending-plugin-purge-transaction.json";
export interface PurgeFile { path: string; before: string | null; after: string | null }
interface Journal { ownerPid: number; files: PurgeFile[]; directories: string[] }
export async function atomicPurgeWrite(destination: string, content: Buffer, createOnly = false) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content);
    if (createOnly) await link(temporary, destination); else await rename(temporary, destination);
  } finally { await remove(temporary); }
}
async function remove(destination: string) {
  await unlink(destination).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
}
function alive(pid: number) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return false; throw error; }
}
export async function recoverPendingPluginPurge(projectRoot: string, own = false) {
  await assertNoSymbolicLinkTraversal(projectRoot, PURGE_JOURNAL);
  const source = await readOptionalBuffer(path.join(projectRoot, PURGE_JOURNAL));
  if (!source) return;
  const journal = JSON.parse(source.toString()) as Journal;
  if (!Number.isSafeInteger(journal.ownerPid) || journal.ownerPid <= 0 || !Array.isArray(journal.files) || !Array.isArray(journal.directories)) throw new Error("Invalid Plugin purge journal.");
  if (!(own && journal.ownerPid === process.pid) && alive(journal.ownerPid)) throw new AgentUISourceError("PLUGIN_PURGE_PENDING", "A Plugin purge is active. Retry after it completes.");
  const project = await readAgentUIProjectConfig(projectRoot);
  const paths = resolveAgentUIProjectPaths(projectRoot, project.config);
  const sourceRelative = (target: string) => projectRelativePath(projectRoot, path.join(paths.sourceRoot, target));
  const lockPath = projectRelativePath(projectRoot, paths.sourceLockPath);
  const allowed = new Set([lockPath, ...["app-ui/app-ui.json", "app-ui/composition-revision.generated.json", "plugins/registry.generated.ts", "agent-contract/frontend-tools.generated.ts", "agent-ui/conversation/frontend-tool-uis.generated.ts", "agent-ui/conversation/integrations.generated.tsx"].map(sourceRelative)]);
  const lockOriginal = journal.files.find(file => file.path === lockPath);
  if (lockOriginal?.before != null) {
    const lock = JSON.parse(Buffer.from(lockOriginal.before, "base64").toString());
    if (lock.sourceRoot !== projectRelativePath(projectRoot, paths.sourceRoot)) throw new Error("Purge lock belongs to another source root.");
    for (const item of Object.values(lock.items ?? {}) as { files: Record<string, unknown> }[])
      for (const target of Object.keys(item.files)) { assertSafeProjectRelativePath(target, "Purge lock target"); allowed.add(sourceRelative(target)); }
  }
  const boundaries = journal.files.flatMap(file => {
    if (file.before === null || path.posix.basename(file.path) !== "manifest.json") return [];
    const directory = path.posix.dirname(file.path);
    if (path.resolve(projectRoot, path.posix.dirname(directory)) !== paths.pluginsRoot) return [];
    const manifest = JSON.parse(Buffer.from(file.before, "base64").toString());
    if (manifest.id !== path.posix.basename(directory)) throw new Error("Invalid purge Plugin boundary.");
    return [directory];
  });
  const owned = (relative: string) => allowed.has(relative) || boundaries.some(boundary => relative === boundary || relative.startsWith(`${boundary}/`));
  if (new Set(journal.files.map(file => file.path)).size !== journal.files.length) throw new Error("Duplicate purge paths.");
  for (const file of journal.files) {
    if (!owned(file.path)) throw new Error(`Purge journal does not own ${file.path}`);
    assertSafeProjectRelativePath(file.path, "Purge recovery path");
    if (![file.before, file.after].every(value => value === null || (typeof value === "string" && Buffer.from(value, "base64").toString("base64") === value))) throw new Error("Invalid purge content.");
    await assertNoSymbolicLinkTraversal(projectRoot, file.path);
  }
  for (const directory of journal.directories) {
    if (!boundaries.some(boundary => directory === boundary || directory.startsWith(`${boundary}/`))) throw new Error("Unowned purge directory.");
    assertSafeProjectRelativePath(directory, "Purge directory");
    await assertNoSymbolicLinkTraversal(projectRoot, directory);
  }
  for (const directory of journal.directories) await mkdir(path.join(projectRoot, directory), { recursive: true });
  for (const file of journal.files) {
    if (file.before === null) await remove(path.join(projectRoot, file.path));
    else await atomicPurgeWrite(path.join(projectRoot, file.path), Buffer.from(file.before, "base64"));
  }
  await remove(path.join(projectRoot, PURGE_JOURNAL));
}
export async function commitPluginPurge(projectRoot: string, files: PurgeFile[], directories: string[], beforeCommit: () => Promise<void>, options: { simulateCrashAfterMutation?: number; beforeMutation?: (file: PurgeFile) => Promise<void> } = {}) {
  const journal: Journal = { ownerPid: process.pid, files, directories };
  await assertNoSymbolicLinkTraversal(projectRoot, PURGE_JOURNAL);
  await atomicPurgeWrite(path.join(projectRoot, PURGE_JOURNAL), Buffer.from(JSON.stringify(journal)), true);
  let simulatedCrash = false;
  let writesStarted = false;
  try {
    await beforeCommit();
    for (const file of files) {
      await assertNoSymbolicLinkTraversal(projectRoot, file.path);
      const current = (await readOptionalBuffer(path.join(projectRoot, file.path)))?.toString("base64") ?? null;
      if (current !== file.before) throw new AgentUISourceError("PLUGIN_PURGE_STATE_CONFLICT", "Project files changed while preparing purge; inspect again.");
    }
    writesStarted = true;
    let count = 0;
    for (const file of files) {
      await options.beforeMutation?.(file);
      await assertNoSymbolicLinkTraversal(projectRoot, file.path);
      if (file.after === null) await remove(path.join(projectRoot, file.path));
      else await atomicPurgeWrite(path.join(projectRoot, file.path), Buffer.from(file.after, "base64"));
      if (++count === options.simulateCrashAfterMutation) { simulatedCrash = true; throw new Error("Simulated purge crash"); }
    }
    for (const directory of [...directories].sort((a, b) => b.length - a.length)) {
      await assertNoSymbolicLinkTraversal(projectRoot, directory);
      await rmdir(path.join(projectRoot, directory));
    }
    for (const file of files) {
      const actual = (await readOptionalBuffer(path.join(projectRoot, file.path)))?.toString("base64") ?? null;
      if (actual !== file.after) throw new Error(`Purge write verification failed: ${file.path}`);
    }
    await remove(path.join(projectRoot, PURGE_JOURNAL));
  } catch (error) {
    if (!simulatedCrash) {
      if (writesStarted) await recoverPendingPluginPurge(projectRoot, true);
      else await remove(path.join(projectRoot, PURGE_JOURNAL));
    }
    throw error;
  }
}
