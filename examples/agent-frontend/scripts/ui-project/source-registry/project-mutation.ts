import { randomUUID } from "node:crypto";
import { link, mkdir, rename, unlink, writeFile, readFile, rmdir } from "node:fs/promises";
import path from "node:path";
import { loadAgentUISourceRegistry, resolveAgentUISourceItemClosure } from "@agent-ui/source-registry";
import { collectAppUIPluginLocations, parseAppUIModelJson } from "../../../framework/contracts/app-ui-model";
import { writeGeneratedPluginRegistry } from "../../generate-plugin-registry";
import { writeGeneratedFrontendToolRegistries } from "../../generate-frontend-tool-registry";
import { writeGeneratedConversationIntegrationRegistry } from "../../generate-conversation-integration-registry";
import { verifyUIProject } from "../../verify-ui";
import { collectPluginAssets } from "../plugin-assets";
import { readAgentUIProjectConfig } from "../project-mode";
import { resolveAgentUIProjectPaths, projectControlConfigForPaths, projectRelativePath } from "../agent-ui-project-paths";
import type { UIProjectControlConfig } from "../types";
import { applyAgentUISourceItem, removeAgentUISourceItems, preflightAgentUISourceApply, preflightAgentUISourceRemove, type ApplyAgentUISourceItemInput, type RemoveAgentUISourceItemsInput } from "./installer";
import { inspectAgentUISources } from "./inspector";
import { readAgentUISourceLock, readOptionalBuffer } from "./lock";
import { AgentUISourceError, assertNoSymbolicLinkTraversal, assertSafeProjectRelativePath, resolveAgentUISourceRoots } from "./path-policy";
import { recoverPendingAgentUISourceTransaction } from "./transaction";

export interface AgentUISourceProjectMutationOptions { config?: UIProjectControlConfig }
export interface AgentUISourceProjectMutationResult {
  schemaVersion: 1;
  operation: "apply" | "remove";
  changed: boolean;
  changedItems: string[];
  sourceChangedPaths: string[];
  generatedChangedPaths: string[];
  changedPaths: string[];
  stateHash: string;
}
interface Original { path: string; beforeContentBase64: string | null }
interface JournalV1 { schemaVersion: 1; originals: Original[] }
interface JournalV2 {
  schemaVersion: 2;
  transactionId: string;
  ownerPid: number;
  createdAt: string;
  originals: Original[];
}
type Journal = JournalV1 | JournalV2;
const JOURNAL = "source-project-transaction.json";
const generatedTargets = ["plugins/registry.generated.ts", "agent-contract/frontend-tools.generated.ts", "agent-ui/conversation/frontend-tool-uis.generated.ts", "agent-ui/conversation/integrations.generated.tsx"];
const ordered = (paths: string[]) => [...new Set(paths)].sort();
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

// Recovery and mutation share one queue so another request in this Host cannot
// mistake an in-flight journal for a crashed operation.
const queues = new Map<string, Promise<unknown>>();
async function exclusive<T>(projectRoot: string, run: () => Promise<T>): Promise<T> {
  const key = path.resolve(projectRoot);
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(run);
  queues.set(key, next);
  try { return await next; } finally { if (queues.get(key) === next) queues.delete(key); }
}
async function context(projectRoot: string, config?: UIProjectControlConfig) {
  const project = await readAgentUIProjectConfig(projectRoot);
  const paths = resolveAgentUIProjectPaths(projectRoot, project.config);
  const effectiveConfig = config ?? projectControlConfigForPaths(paths);
  const roots = await resolveAgentUISourceRoots(projectRoot, effectiveConfig);
  return { project, paths, config: effectiveConfig, ...roots,
    journalPath: path.join(roots.metadataRoot, JOURNAL),
    lockPath: projectRelativePath(projectRoot, path.join(roots.metadataRoot, "source-lock.json")),
    generatedPaths: generatedTargets.map(target => projectRelativePath(projectRoot, path.join(path.dirname(paths.pluginsRoot), target))),
  };
}
async function atomicWrite(destination: string, content: Buffer, createOnly = false) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content);
    if (createOnly) await link(temporary, destination);
    else await rename(temporary, destination);
  } finally { await removeOptional(temporary); }
}
async function removeOptional(destination: string) {
  await unlink(destination).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
}
async function pruneEmptySourceDirectories(projectRoot: string, sourceRoot: string, relatives: string[]) {
  const directories = new Set<string>();
  for (const relative of relatives) {
    let directory = path.dirname(path.join(projectRoot, relative));
    while (directory !== sourceRoot && directory.startsWith(`${sourceRoot}${path.sep}`)) {
      directories.add(directory);
      directory = path.dirname(directory);
    }
  }
  for (const directory of [...directories].sort((a, b) => b.length - a.length)) {
    await rmdir(directory).catch((error: NodeJS.ErrnoException) => {
      if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error.code ?? "")) throw error;
    });
  }
}
function parseJournal(source: Buffer): Journal {
  const value = JSON.parse(source.toString("utf8"));
  if (![1, 2].includes(value?.schemaVersion) || !Array.isArray(value.originals)) throw new Error("Invalid Host source mutation journal.");
  const originals: Original[] = value.originals.map((entry: Original) => {
    if (!entry || typeof entry.path !== "string" || !(entry.beforeContentBase64 === null || typeof entry.beforeContentBase64 === "string")) throw new Error("Invalid Host snapshot.");
    assertSafeProjectRelativePath(entry.path, "Host snapshot path");
    if (entry.beforeContentBase64 !== null && Buffer.from(entry.beforeContentBase64, "base64").toString("base64") !== entry.beforeContentBase64) throw new Error("Invalid Host snapshot content.");
    return { path: entry.path, beforeContentBase64: entry.beforeContentBase64 };
  });
  if (new Set(originals.map(entry => entry.path)).size !== originals.length) throw new Error("Duplicate Host snapshot paths.");
  if (value.schemaVersion === 1) return { schemaVersion: 1, originals };
  if (
    typeof value.transactionId !== "string" ||
    !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value.transactionId) ||
    !Number.isSafeInteger(value.ownerPid) || value.ownerPid <= 0 || value.ownerPid > 0x7fffffff ||
    typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))
  ) throw new Error("Invalid Host source mutation owner.");
  return { schemaVersion: 2, transactionId: value.transactionId, ownerPid: value.ownerPid, createdAt: value.createdAt, originals };
}
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EPERM") return true;
    if (code === "ESRCH") return false;
    throw error;
  }
}
function mutationPending(journal?: JournalV2): AgentUISourceError {
  return new AgentUISourceError("AGENT_UI_SOURCE_PROJECT_MUTATION_PENDING", "A Host source mutation is active; inspect again after it finishes.",
    journal === undefined ? undefined : { transactionId: journal.transactionId, ownerPid: journal.ownerPid, createdAt: journal.createdAt });
}
async function recover(projectRoot: string, ctx: Awaited<ReturnType<typeof context>>, rollbackTransactionId?: string) {
  await assertNoSymbolicLinkTraversal(projectRoot, projectRelativePath(projectRoot, ctx.journalPath));
  const source = await readOptionalBuffer(ctx.journalPath);
  if (!source) {
    if (rollbackTransactionId !== undefined) throw mutationPending();
    // No Host journal authorizes this caller to recover a storage transaction:
    // another process may publish its Host journal immediately after our read.
    // Initialization owns its separate storage recovery; apply/remove recover
    // storage only after their own Host journal has been acquired.
    return;
  }
  const journal = parseJournal(source);
  if (rollbackTransactionId !== undefined) {
    // Only the mutation that created this exact journal may roll itself back
    // while its process is alive. A public recovery call has no such authority.
    if (journal.schemaVersion !== 2 || journal.transactionId !== rollbackTransactionId || journal.ownerPid !== process.pid) throw mutationPending();
  } else if (journal.schemaVersion === 2 && isProcessAlive(journal.ownerPid)) {
    // Stop before touching even the low-level journal of the active owner.
    throw mutationPending(journal);
  }
  // Validate the entire journal before restoring any path. Source ownership is
  // derived from registry targets and the snapshotted lock, never arbitrary paths.
  const registry = await loadAgentUISourceRegistry();
  const targets = registry.items.flatMap(item => item.loadedFiles.map(file => file.target));
  const lockOriginal = journal.originals.find(entry => entry.path === ctx.lockPath);
  if (!lockOriginal) throw new Error("Host snapshot is missing its Source lock.");
  if (lockOriginal.beforeContentBase64 !== null) {
    const lock = JSON.parse(Buffer.from(lockOriginal.beforeContentBase64, "base64").toString("utf8"));
    for (const item of Object.values(lock.items ?? {}) as { files: Record<string, unknown> }[]) targets.push(...Object.keys(item.files));
  }
  const allowed = new Set([ctx.lockPath, ...ctx.generatedPaths, ...targets.map(target => {
    assertSafeProjectRelativePath(target, "Source lock target");
    return projectRelativePath(projectRoot, path.join(ctx.sourceRoot, target));
  })]);
  for (const entry of journal.originals) {
    if (!allowed.has(entry.path)) throw new Error(`Host snapshot does not own ${entry.path}.`);
    await assertNoSymbolicLinkTraversal(projectRoot, entry.path);
  }
  await recoverPendingAgentUISourceTransaction(projectRoot, ctx.config);
  for (const entry of journal.originals) {
    const destination = path.join(projectRoot, entry.path);
    if (entry.beforeContentBase64 === null) await removeOptional(destination);
    else await atomicWrite(destination, Buffer.from(entry.beforeContentBase64, "base64"));
  }
  await pruneEmptySourceDirectories(projectRoot, ctx.sourceRoot, journal.originals.filter(entry => entry.beforeContentBase64 === null).map(entry => entry.path));
  await removeOptional(ctx.journalPath);
}
export async function recoverPendingAgentUISourceProjectMutation(projectRoot: string, config?: UIProjectControlConfig): Promise<void> {
  await exclusive(projectRoot, async () => recover(projectRoot, await context(projectRoot, config)));
}

async function mutate(projectRoot: string, operation: "apply" | "remove", input: ApplyAgentUISourceItemInput | RemoveAgentUISourceItemsInput, options: AgentUISourceProjectMutationOptions): Promise<AgentUISourceProjectMutationResult> {
  return exclusive(projectRoot, () => mutateAttempt(projectRoot, operation, input, options, true));
}
async function mutateAttempt(projectRoot: string, operation: "apply" | "remove", input: ApplyAgentUISourceItemInput | RemoveAgentUISourceItemsInput, options: AgentUISourceProjectMutationOptions, retryAdmission: boolean): Promise<AgentUISourceProjectMutationResult> {
  const ctx = await context(projectRoot, options.config);
  await recover(projectRoot, ctx);
  const registry = await loadAgentUISourceRegistry();
  const { lock } = await readAgentUISourceLock(projectRoot, ctx.config);
  let targets: string[];
  if (operation === "apply") {
    const admission = await preflightAgentUISourceApply(projectRoot, input as ApplyAgentUISourceItemInput, ctx.config, registry);
    targets = admission.closure.filter(item => !ctx.config.agentUI.providedSourceItems?.includes(item.id))
      .flatMap(item => [...item.loadedFiles.map(file => file.target), ...Object.keys(lock.items[item.id]?.files ?? {})]);
  } else {
    const admission = await preflightAgentUISourceRemove(projectRoot, input as RemoveAgentUISourceItemsInput, ctx.config, registry);
    const remaining = new Set(Object.entries(lock.items).filter(([id]) => !admission.removeIds.includes(id)).flatMap(([, item]) => Object.keys(item.files)));
    targets = admission.removeIds.flatMap(id => Object.keys(lock.items[id]!.files)).filter(target => !remaining.has(target));
    const disappearing = new Set(targets.map(target => projectRelativePath(projectRoot, path.join(ctx.sourceRoot, target))));
    const inventory = await collectPluginAssets(projectRoot, ctx.paths, projectControlConfigForPaths(ctx.paths));
    if (inventory.errors.length) throw new AgentUISourceError("AGENT_UI_SOURCE_INTEGRITY_FAILED", "Cannot determine Plugin ownership for source removal.", inventory.errors);
    const pluginIds = inventory.assets.filter(asset => {
      const directory = path.posix.dirname(asset.manifestPath);
      return [...disappearing].some(target => target.startsWith(`${directory}/`));
    }).map(asset => asset.pluginId);
    const model = parseAppUIModelJson(await readFile(ctx.paths.appUIModelPath, "utf8"));
    const instances = collectAppUIPluginLocations(model).filter(({ plugin }) => pluginIds.includes(plugin.pluginId));
    if (instances.length) throw new AgentUISourceError("AGENT_UI_SOURCE_COMPOSITION_IN_USE", "Source Plugins still have AppUIModel instances; remove their composition first.", {
      itemIds: admission.removeIds, pluginIds: ordered(instances.map(({ plugin }) => plugin.pluginId)), instanceIds: ordered(instances.map(({ plugin }) => plugin.id)),
    });
  }
  const snapshotPaths = ordered([ctx.lockPath, ...ctx.generatedPaths, ...targets.map(target => projectRelativePath(projectRoot, path.join(ctx.sourceRoot, target)))]);
  const originals: Original[] = [];
  for (const relative of snapshotPaths) {
    await assertNoSymbolicLinkTraversal(projectRoot, relative);
    originals.push({ path: relative, beforeContentBase64: (await readOptionalBuffer(path.join(projectRoot, relative)))?.toString("base64") ?? null });
  }
  await assertNoSymbolicLinkTraversal(projectRoot, projectRelativePath(projectRoot, ctx.journalPath));
  const journal: JournalV2 = { schemaVersion: 2, transactionId: randomUUID(), ownerPid: process.pid, createdAt: new Date().toISOString(), originals };
  try { await atomicWrite(ctx.journalPath, Buffer.from(`${JSON.stringify(journal, null, 2)}\n`), true); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      // Re-read the winner: active owners stop us; stale journals roll back.
      // Admission and snapshots must be recomputed after recovery, never reused.
      await recover(projectRoot, ctx);
      if (!retryAdmission) throw mutationPending();
      return mutateAttempt(projectRoot, operation, input, options, false);
    }
    throw error;
  }
  try {
    const result = operation === "apply"
      ? await applyAgentUISourceItem(projectRoot, input as ApplyAgentUISourceItemInput, ctx.config, registry)
      : await removeAgentUISourceItems(projectRoot, input as RemoveAgentUISourceItemsInput, ctx.config, registry);
    if (operation === "remove") await pruneEmptySourceDirectories(projectRoot, ctx.sourceRoot, result.changedPaths);
    const plugin = await writeGeneratedPluginRegistry(projectRoot);
    const tools = await writeGeneratedFrontendToolRegistries(projectRoot);
    const integrations = await writeGeneratedConversationIntegrationRegistry(projectRoot);
    const after = await inspectAgentUISources(projectRoot, ctx.config, registry);
    if (operation === "apply") {
      const ids = new Set(resolveAgentUISourceItemClosure(registry, (input as ApplyAgentUISourceItemInput).itemId).map(item => item.id));
      const invalid = after.items.filter(item => ids.has(item.id)).filter(item => !["managed", "customized"].includes(item.status) || item.dependencyIssues.length || item.resolvedRequirements.some(requirement => !requirement.compatible));
      if (invalid.length) throw new AgentUISourceError("AGENT_UI_SOURCE_INTEGRITY_FAILED", "Installed source dependency closure is incomplete.", invalid);
    }
    const verification = await verifyUIProject(projectRoot, projectControlConfigForPaths(ctx.paths, ctx.config), { projectConfigOverride: ctx.project.config });
    if (verification.status !== "passed") throw new AgentUISourceError("AGENT_UI_SOURCE_PROJECT_VERIFICATION_FAILED", "Source mutation did not leave a valid UI project.", { errors: verification.errors });
    const sourceChangedPaths = ordered(result.changedPaths.map(relative => path.posix.normalize(relative)));
    const generatedChangedPaths = ordered([...(plugin.changed ? [plugin.path] : []), ...tools.changedPaths, ...integrations.changedPaths]);
    const changedPaths = ordered([...sourceChangedPaths, ...generatedChangedPaths]);
    await removeOptional(ctx.journalPath);
    return { schemaVersion: 1, operation, changed: changedPaths.length > 0, changedItems: ordered(result.changedItems), sourceChangedPaths, generatedChangedPaths, changedPaths, stateHash: after.stateHash };
  } catch (error) {
    try { await recover(projectRoot, ctx, journal.transactionId); }
    catch (rollbackError) { throw new AgentUISourceError("AGENT_UI_SOURCE_PROJECT_ROLLBACK_FAILED", "Host source mutation failed and rollback did not complete.", { cause: message(error), rollbackCause: message(rollbackError), journalPath: projectRelativePath(projectRoot, ctx.journalPath) }); }
    throw error;
  }
}
export async function applyAgentUISourceProjectMutation(projectRoot: string, input: ApplyAgentUISourceItemInput, options: AgentUISourceProjectMutationOptions = {}): Promise<AgentUISourceProjectMutationResult> {
  return mutate(projectRoot, "apply", input, options);
}
export async function removeAgentUISourceProjectMutation(projectRoot: string, input: RemoveAgentUISourceItemsInput, options: AgentUISourceProjectMutationOptions = {}): Promise<AgentUISourceProjectMutationResult> {
  return mutate(projectRoot, "remove", input, options);
}
