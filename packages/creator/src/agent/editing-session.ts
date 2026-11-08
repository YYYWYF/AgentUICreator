import { realpath, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { creatorContentHash, readCreatorFileState } from "./files/creatorFileState.js";
import { forgetReadEvidence, logicalProjectPath, readProjectFile } from "./project-read.js";
import { sourceRoot } from "./activity.js";
import type { ToolContext } from "./tools.js";

export interface EditingTarget {
  id: string;
  kind: "plugin_source" | "application_config" | "project_file";
  name: string;
  entryPath: string;
  pluginId?: string;
  definitionPath?: string;
  manifestPath?: string;
}
export interface EditingSelection {
  target: EditingTarget;
  identity: string;
  guards: string;
  filePaths: string[];
}
interface WorkingSet extends EditingSelection {
  files: { path: string; hash: string; offset: number }[];
  previousChange: { runId: string; staticallyVerified: boolean; changes: { path: string; before: string; after: string }[] };
  savedAt: number;
}

/** Fingerprint navigation inputs only. No cached types, validation or authority are reused. */
export async function editingProjectIdentity(root: string) {
  const paths = [".agent-ui/project.json", ".agent-ui/source-lock.json", ".agent-ui/plugin-ownership.json", "package.json",
    "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb", "tsconfig.json"];
  const states = await Promise.all(paths.map(async file => [file, (await readCreatorFileState(root, file)).hash]));
  let catalog = "unavailable";
  try {
    const installed = createRequire(path.join(root, "package.json")).resolve("@za38.03/agent-ui-plugins/catalog.json");
    const packageMetadata = await readFile(path.join(path.dirname(installed), "..", "package.json")).catch(error => {
      if (error.code === "ENOENT") return Buffer.from("<missing>");
      throw error;
    });
    catalog = creatorContentHash(JSON.stringify([await realpath(installed), creatorContentHash(await readFile(installed)), creatorContentHash(packageMetadata)]));
  } catch (error) {
    if (!["MODULE_NOT_FOUND", "ERR_PACKAGE_PATH_NOT_EXPORTED", "ENOENT"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
  }
  return creatorContentHash(JSON.stringify([await realpath(root), states, catalog]));
}

async function targetGuards(root: string, target: EditingTarget) {
  const marker = target.manifestPath ? path.posix.join(path.posix.dirname(target.manifestPath), "application.json") : undefined;
  return creatorContentHash(JSON.stringify(await Promise.all([target.definitionPath, target.manifestPath, marker]
    .filter((file): file is string => Boolean(file) && file !== target.entryPath)
    .map(async file => [file, (await readCreatorFileState(root, logicalProjectPath(file))).hash]))));
}

export async function selectEditingTarget(context: ToolContext, target: EditingTarget, filePaths = [target.entryPath], identity?: string) {
  context.editingSelection = { target, identity: identity ?? await editingProjectIdentity(context.root),
    guards: await targetGuards(context.root, target), filePaths: [...new Set(filePaths.map(logicalProjectPath))].slice(0, 8) };
}

/** Navigation follows observed files, never guessed intent or an operation plan. */
export async function rememberProjectTargets(context: ToolContext, inspection: Record<string, any>) {
  const catalog = inspection.authoringTargetCatalog;
  if (!catalog?.bindings) return;
  const identity = await editingProjectIdentity(context.root);
  context.editingTargets = catalog.bindings.flatMap((binding: any) => {
    const candidate = catalog.candidates?.find((item: any) => item.id === binding.targetId);
    if (!candidate || !binding.ownerPath || !["application_config", "plugin_source"].includes(candidate.kind)) return [];
    return [{ target: { id: candidate.id, kind: candidate.kind, name: candidate.name, entryPath: binding.ownerPath,
      pluginId: binding.pluginId, definitionPath: binding.definitionPath, manifestPath: binding.manifestPath }, identity,
      description: candidate.description, intents: candidate.intents, relatedPluginIds: candidate.relatedPluginIds }];
  });
}

async function inferEditingSelection(context: ToolContext) {
  // Prefer actual changed files to incidental reads of Skills, docs or other owners.
  const changed = [...context.activity.after.keys()].filter(file => context.activity.before.get(file)?.hash !== context.activity.after.get(file)?.hash);
  const observed = changed.length ? changed : [...(context.readRanges?.keys() ?? [])].slice(-3);
  if (!observed.length || observed.length > 3) return;
  const root = await sourceRoot(context.root);
  if (observed.some(file => !file.startsWith(root + "/") || /(?:^|\/)(?:upstream|vendor|vendors|framework|runtime)(?:\/|$)/u.test(file))) return;
  const matches = (context.editingTargets ?? []).filter(item => observed.includes(item.target.entryPath));
  if (matches.length === 1 && observed.length === 1) {
    const match = matches[0]!;
    await selectEditingTarget(context, match.target, observed, match.identity);
  } else if (changed.length === 1) {
    const file = changed[0]!;
    await selectEditingTarget(context, { id: `file:${file}`, kind: "project_file", name: path.posix.basename(file), entryPath: file }, [file]);
  }
}

function changedText(before: string, after: string) {
  const left = before.split(/\r?\n/u), right = after.split(/\r?\n/u);
  let start = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) start++;
  return { before: left.slice(start, start + 6).join("\n").slice(0, 600), after: right.slice(start, start + 6).join("\n").slice(0, 600) };
}

/** Bounded, process-local navigation memory, deliberately separate from graph checkpoints. */
export class EditingSessionStore {
  private readonly entries = new Map<string, WorkingSet>();
  constructor(private readonly now = Date.now, private readonly ttlMs = 20 * 60_000, private readonly maxEntries = 64) {}
  private async key(context: ToolContext) { return JSON.stringify([await realpath(context.root), context.threadId]); }
  async forget(context: Pick<ToolContext, "root" | "threadId">) {
    this.entries.delete(JSON.stringify([await realpath(context.root), context.threadId]));
  }
  async remember(context: ToolContext) {
    const key = await this.key(context);
    if (!context.editingSelection || [...context.activity.after.keys()].some(file => !context.editingSelection!.filePaths.includes(file))) {
      delete context.editingSelection;
      await inferEditingSelection(context);
    }
    const selection = context.editingSelection;
    if (!selection) { this.entries.delete(key); return; }
    if ([...context.activity.after.keys()].some(file => !selection.filePaths.includes(file))) { this.entries.delete(key); return; }
    if (selection.identity !== await editingProjectIdentity(context.root) || selection.guards !== await targetGuards(context.root, selection.target)) {
      this.entries.delete(key); return;
    }
    const files: WorkingSet["files"] = [];
    for (const file of selection.filePaths) {
      const observation = context.activity.observations.get(file);
      if (!observation?.exists) continue;
      const state = await readCreatorFileState(context.root, file);
      const expected = context.activity.after.get(file)?.hash ?? observation.hash;
      if (!state.exists || state.hash !== expected) { this.entries.delete(key); return; }
      const before = context.activity.before.get(file)?.content;
      const previousRange = context.readRanges?.get(file)?.at(-1);
      let offset = Math.max(0, (previousRange?.start ?? 1) - 1);
      if (before !== undefined && state.content !== undefined && before !== state.content) {
        const left = before.split(/\r?\n/u), right = state.content.split(/\r?\n/u);
        let line = 0;
        while (line < left.length && line < right.length && left[line] === right[line]) line++;
        offset = Math.max(0, line - 8);
      }
      files.push({ path: file, hash: state.hash, offset });
    }
    if (!files.some(file => file.path === selection.target.entryPath)) { this.entries.delete(key); return; }
    const changes = [...context.activity.after].filter(([file]) => files.some(item => item.path === file))
      .slice(0, 2).map(([file, after]) => ({ path: file, ...changedText(context.activity.before.get(file)?.content ?? "", after.content ?? "") }));
    for (const [id, entry] of this.entries) if (this.now() - entry.savedAt > this.ttlMs) this.entries.delete(id);
    this.entries.delete(key);
    this.entries.set(key, { ...selection, files, previousChange: { runId: context.activity.runId,
      staticallyVerified: context.activity.validationRevision === context.activity.revision, changes }, savedAt: this.now() });
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value!);
  }
  async prepare(context: ToolContext, requestedPluginId?: string) {
    const key = await this.key(context), saved = this.entries.get(key);
    if (!saved) return undefined;
    // A different explicit target must not pay for reading the previous owner's source.
    if (requestedPluginId && saved.target.pluginId !== requestedPluginId) return undefined;
    const files: Awaited<ReturnType<typeof readProjectFile>>[] = [];
    const stale = (reason: string) => {
      forgetReadEvidence(context, files.map(file => file.path));
      delete context.editingSelection;
      this.entries.delete(key); return { status: "stale" as const, reason };
    };
    if (this.now() - saved.savedAt > this.ttlMs) return stale("expired");
    if (saved.identity !== await editingProjectIdentity(context.root) || saved.guards !== await targetGuards(context.root, saved.target)) return stale("project_or_owner_changed");
    for (const file of saved.files) if ((await readCreatorFileState(context.root, file.path)).hash !== file.hash) return stale("file_changed");
    try {
      for (const file of saved.files) {
        const current = await readProjectFile(context, { file_path: file.path, offset: file.offset, limit: 120 }, 6000);
        files.push(current);
        if (current.hash !== file.hash) return stale("file_changed");
      }
      // Recheck metadata after the reads as well; files and ownership can change independently.
      if (saved.identity !== await editingProjectIdentity(context.root) || saved.guards !== await targetGuards(context.root, saved.target)) return stale("project_or_owner_changed");
    } catch (error) { stale("read_unavailable"); throw error; }
    context.editingSelection = { target: saved.target, identity: saved.identity, guards: saved.guards, filePaths: saved.filePaths };
    return { status: "fresh" as const, target: saved.target, files, previousChange: saved.previousChange,
      interpretation: "Recent edit navigation and source files freshly read in this run, not a selected goal, permission, current type/API contract or current validation. Follow the latest user request; inspect another target whenever needed." };
  }
}
