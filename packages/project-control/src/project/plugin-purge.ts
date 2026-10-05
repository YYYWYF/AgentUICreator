import { randomUUID } from "node:crypto";
import { cp, mkdtemp, readdir, readFile, rm, rmdir, symlink, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { collectAppUIPluginLocations, parseAppUIModelJson } from "../framework/contracts/app-ui-model";
import { compileAppUIModel } from "../framework/contracts/app-ui-compiler";
import { mutateAppUIModel } from "./app-ui-transaction";
import { readAgentUIProjectConfig } from "./project-mode";
import { resolveAgentUIProjectPaths, projectControlConfigForPaths, projectRelativePath } from "./agent-ui-project-paths";
import { inspectPluginSourceReferences } from "./plugin-source-references";
import { collectPluginAssets } from "./plugin-assets";
import { generatePluginRegistry } from "./registry-generator";
import { analyzePluginServiceDeclarations } from "./service-dependency-inspector";
import { writeGeneratedPluginRegistry } from "../generate-plugin-registry";
import { writeGeneratedFrontendToolRegistries } from "../generate-frontend-tool-registry";
import { writeGeneratedConversationIntegrationRegistry } from "../generate-conversation-integration-registry";
import { verifyUIProject } from "../verify-ui";
import { inspectAgentUISources } from "./source-registry/inspector";
import { readAgentUISourceLock, readOptionalBuffer, sha256 } from "./source-registry/lock";
import { removeAgentUISourceItems } from "./source-registry/installer";
import { assertNoSymbolicLinkTraversal, AgentUISourceError } from "./source-registry/path-policy";
import { creatorCancelMarkerSchemaPattern, assertCreatorCommitAllowed } from "./creator-cancel-marker";
import { commitPluginPurge, type PurgeFile } from "./plugin-purge-transaction";

export const pluginPurgeInputSchema = z.strictObject({
  pluginId: z.string().min(1).max(200).regex(/\S/u).transform(value => value.trim()),
  appUIModelHash: z.string().regex(/^[a-f0-9]{64}$/),
  sourceStateHash: z.string().regex(/^[a-f0-9]{64}$/),
  cancelMarker: z.string().regex(creatorCancelMarkerSchemaPattern).optional(),
});
export type PluginPurgeInput = z.infer<typeof pluginPurgeInputSchema>;
const fail = (message: string): never => { throw new AgentUISourceError("PLUGIN_PURGE_UNSAFE", message); };
const excluded = new Set(["node_modules", ".git", ".agentuicreator", "dist", "build"]);
async function tree(root: string, directory: string, files = new Map<string, string>(), directories: string[] = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relativeDirectory = projectRelativePath(root, directory);
    const insidePlugin = relativeDirectory.split("/").includes("plugins");
    if (excluded.has(entry.name) && !insidePlugin) continue;
    const absolute = path.join(directory, entry.name);
    const relative = projectRelativePath(root, absolute);
    await assertNoSymbolicLinkTraversal(root, relative);
    if (entry.isDirectory()) { directories.push(relative); await tree(root, absolute, files, directories); }
    else if (entry.isFile()) files.set(relative, (await readFile(absolute)).toString("base64"));
    else fail(`Unsupported source entry: ${relative}`);
  }
  return { files, directories };
}
async function context(root: string) {
  const project = await readAgentUIProjectConfig(root);
  const paths = resolveAgentUIProjectPaths(root, project.config);
  return { project, paths, config: projectControlConfigForPaths(paths) };
}
async function assertHashes(root: string, input: PluginPurgeInput) {
  const ctx = await context(root);
  if (sha256(await readFile(ctx.paths.appUIModelPath)) !== input.appUIModelHash) throw new AgentUISourceError("APP_UI_MODEL_HASH_CONFLICT", "Composition changed; inspect again.");
  if ((await inspectAgentUISources(root, ctx.config)).stateHash !== input.sourceStateHash) throw new AgentUISourceError("AGENT_UI_SOURCE_STATE_CONFLICT", "Source state changed; inspect again.");
  return ctx;
}
/** Preparation uses existing Host admission/ownership logic exclusively in a disposable
 * project. No Composition or Source transaction is nested in the live transaction. */
export async function planPluginPurge(root: string, input: PluginPurgeInput) {
  const ctx = await assertHashes(root, input);
  const inventory = await collectPluginAssets(root, ctx.paths, ctx.config);
  if (inventory.errors.length) fail("Cannot prove current Plugin inventory.");
  const target = inventory.assets.find(asset => asset.pluginId === input.pluginId);
  if (!target) fail("Plugin is not installed.");
  const beforeModel = parseAppUIModelJson(await readFile(ctx.paths.appUIModelPath, "utf8"));
  const primaryInstances = collectAppUIPluginLocations(beforeModel).filter(({ plugin }) => plugin.pluginId === input.pluginId).map(({ plugin }) => plugin.id);
  const declarations = analyzePluginServiceDeclarations(root, inventory.assets, ctx.paths.sourceRoot);
  if (declarations.issues.length) fail("Service declarations are incomplete; cannot safely purge.");
  const snapshot = await tree(root, ctx.paths.sourceRoot);
  const lockRelative = projectRelativePath(root, ctx.paths.sourceLockPath);
  const originalLock = await readOptionalBuffer(ctx.paths.sourceLockPath);
  if (originalLock) snapshot.files.set(lockRelative, originalLock.toString("base64"));
  const temporary = await mkdtemp(path.join(tmpdir(), "agent-ui-purge-"));
  try {
    await cp(root, temporary, { recursive: true, dereference: false, filter: source => !excluded.has(path.basename(source)) || path.resolve(source).startsWith(`${ctx.paths.pluginsRoot}${path.sep}`) });
    const dependencies = path.join(root, "node_modules");
    if (await stat(dependencies).then(() => true, error => { if (error.code === "ENOENT") return false; throw error; }))
      await symlink(dependencies, path.join(temporary, "node_modules"), "dir");
    const staged = await context(temporary);
    if (primaryInstances.length) await mutateAppUIModel(temporary, {
      appUIModelHash: input.appUIModelHash,
      operations: primaryInstances.filter(instanceId => {
        const locations = collectAppUIPluginLocations(beforeModel);
        let location = locations.find(({ plugin }) => plugin.id === instanceId);
        while (location?.target.type === "plugin_slot") {
          const parentId = location.target.parentInstanceId;
          if (primaryInstances.includes(parentId)) return false;
          location = locations.find(({ plugin }) => plugin.id === parentId);
        }
        return true;
      }).map(instanceId => ({ type: "remove_plugin_default" as const, instanceId })),
      featureRemoval: true,
    }, { purgePluginId: input.pluginId });
    const finalModel = parseAppUIModelJson(await readFile(staged.paths.appUIModelPath, "utf8"));
    const remaining = collectAppUIPluginLocations(finalModel);
    const remainingPluginIds = new Set(remaining.map(({ plugin }) => plugin.pluginId));
    const remainingInstanceIds = new Set(remaining.map(({ plugin }) => plugin.id));
    const removedInstanceIds = collectAppUIPluginLocations(beforeModel).filter(({ plugin }) => !remainingInstanceIds.has(plugin.id)).map(({ plugin }) => plugin.id);
    const cleanupProviders = collectAppUIPluginLocations(beforeModel).filter(({ plugin, target }) => !primaryInstances.includes(plugin.id) && removedInstanceIds.includes(plugin.id) && target.type === "application" && inventory.assets.find(asset => asset.pluginId === plugin.pluginId)?.authoring?.cleanup?.removeWhenUnused === true).map(({ plugin }) => plugin.id);
    const removedPluginIds = new Set([input.pluginId, ...collectAppUIPluginLocations(beforeModel).filter(({ plugin }) => cleanupProviders.includes(plugin.id) && !remainingPluginIds.has(plugin.pluginId)).map(({ plugin }) => plugin.pluginId)]);
    const removedServices = new Set(declarations.plugins.filter(entry => removedPluginIds.has(entry.pluginId)).flatMap(entry => entry.provides));
    if (remaining.some(({ plugin }) => {
      const declaration = declarations.plugins.find(entry => entry.pluginId === plugin.pluginId);
      return !declaration || [...declaration.inject, ...declaration.optionalInject].some(service => removedServices.has(service));
    })) fail("A retained required or optional consumer still uses a purged Provider.");
    const { lock } = await readAgentUISourceLock(root, ctx.config);
    const managedItems = new Set<string>();
    const userDirectories: string[] = [];
    for (const asset of inventory.assets.filter(asset => removedPluginIds.has(asset.pluginId))) {
      const directory = path.posix.dirname(asset.manifestPath);
      if (path.resolve(root, directory) !== path.join(ctx.paths.pluginsRoot, asset.pluginId)) fail(`Plugin has no independent directory boundary: ${asset.pluginId}`);
      const prefix = projectRelativePath(ctx.paths.sourceRoot, path.join(root, directory)) + "/";
      const owners = Object.entries(lock.items).filter(([, item]) => Object.keys(item.files).some(file => file.startsWith(prefix)));
      if (owners.length) {
        for (const [id, item] of owners) {
          for (const other of inventory.assets.filter(other => !removedPluginIds.has(other.pluginId))) {
            const otherManifest = projectRelativePath(ctx.paths.sourceRoot, path.join(root, other.manifestPath));
            if (Object.hasOwn(item.files, otherManifest)) fail(`Source Item ${id} also owns retained Plugin ${other.pluginId}.`);
          }
          managedItems.add(id);
        }
        const owned = new Set(owners.flatMap(([, item]) => Object.keys(item.files)));
        const local = await tree(root, path.join(root, directory));
        for (const file of local.files.keys()) {
          if (!owned.has(projectRelativePath(ctx.paths.sourceRoot, path.join(root, file)))) fail(`Managed Plugin has unowned files: ${file}`);
        }
      } else userDirectories.push(directory);
    }
    if (managedItems.size) {
      const state = await inspectAgentUISources(temporary, staged.config);
      await removeAgentUISourceItems(temporary, { itemIds: [...managedItems], expectedStateHash: state.stateHash }, staged.config);
    }
    for (const directory of userDirectories) await rm(path.join(temporary, directory), { recursive: true });
    // Remove only empty managed directories; retained shared ownership is never deleted.
    const removedDirectories = inventory.assets.filter(asset => removedPluginIds.has(asset.pluginId)).map(asset => path.posix.dirname(asset.manifestPath));
    for (const directory of snapshot.directories.filter(directory => removedDirectories.some(boundary => directory === boundary || directory.startsWith(`${boundary}/`))).sort((a, b) => b.length - a.length)) {
      await rmdir(path.join(temporary, directory)).catch((error: NodeJS.ErrnoException) => { if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error.code ?? "")) throw error; });
    }
    await writeGeneratedPluginRegistry(temporary);
    await writeGeneratedFrontendToolRegistries(temporary);
    await writeGeneratedConversationIntegrationRegistry(temporary);
    const generation = await generatePluginRegistry(temporary, finalModel, { paths: staged.paths, config: staged.config });
    if (generation.errors.length || generation.assets.some(asset => removedPluginIds.has(asset.pluginId)) || remaining.some(({ plugin }) => removedPluginIds.has(plugin.pluginId))) fail("Final Plugin inventory still contains a purged Plugin or is invalid.");
    compileAppUIModel(finalModel, generation.activeComposition.compositionCatalog);
    await writeFile(path.join(path.dirname(staged.paths.appUIModelPath), "composition-revision.generated.json"), JSON.stringify({
      transactionId: randomUUID(),
      appUIModelHash: sha256(await readFile(staged.paths.appUIModelPath)),
      capabilityCatalogRevision: generation.capabilityCatalog.revision,
    }, null, 2) + "\n");
    const verification = await verifyUIProject(temporary, staged.config);
    if (verification.status !== "passed") throw new AgentUISourceError("PLUGIN_PURGE_VERIFICATION_FAILED", "Final project verification failed.", verification.errors);
    await readAgentUISourceLock(temporary, staged.config);
    const after = await tree(temporary, staged.paths.sourceRoot);
    const nextLock = await readOptionalBuffer(staged.paths.sourceLockPath);
    if (nextLock) after.files.set(lockRelative, nextLock.toString("base64"));
    const files: PurgeFile[] = [...new Set([...snapshot.files.keys(), ...after.files.keys()])].sort().flatMap(relative => {
      const before = snapshot.files.has(relative) ? snapshot.files.get(relative)! : null;
      const next = after.files.has(relative) ? after.files.get(relative)! : null;
      return before === next ? [] : [{ path: relative, before, after: next }];
    });
    const disappearingFiles = new Set(files.filter(file => file.after === null).map(file => file.path));
    const generatedFiles = new Set(["plugins/registry.generated.ts", "agent-contract/frontend-tools.generated.ts", "agent-ui/conversation/frontend-tool-uis.generated.ts", "agent-ui/conversation/integrations.generated.tsx"].map(target => projectRelativePath(root, path.join(ctx.paths.sourceRoot, target))));
    for (const asset of inventory.assets.filter(asset => removedPluginIds.has(asset.pluginId))) {
      const references = await inspectPluginSourceReferences(root, ctx.paths, asset.pluginId, asset.directory);
      if (references.truncated || references.references.some(reference => !disappearingFiles.has(reference.path) && !generatedFiles.has(reference.path)))
        fail(`Retained source references Plugin ${asset.pluginId}.`);
    }
    const directories = snapshot.directories.filter(directory => !after.directories.includes(directory));
    return { primaryInstances, cleanupProviders, removedInstanceIds, managedItems: [...managedItems].sort(), userDirectories, removedPluginIds: [...removedPluginIds].sort(), finalModel, files, directories, baseline: snapshot.files,
      appUIModelHash: sha256(await readFile(staged.paths.appUIModelPath)), sourceStateHash: (await inspectAgentUISources(temporary, staged.config)).stateHash };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
export async function purgeUIPlugin(root: string, input: PluginPurgeInput, options: { simulateCrashAfterMutation?: number } = {}) {
  const plan = await planPluginPurge(root, input);
  await commitPluginPurge(root, plan.files, plan.directories, async () => {
    await assertCreatorCommitAllowed(root, input.cancelMarker);
    const ctx = await assertHashes(root, input);
    const current = await tree(root, ctx.paths.sourceRoot);
    const lock = await readOptionalBuffer(ctx.paths.sourceLockPath);
    if (lock) current.files.set(projectRelativePath(root, ctx.paths.sourceLockPath), lock.toString("base64"));
    if (current.files.size !== plan.baseline.size || [...plan.baseline].some(([file, source]) => current.files.get(file) !== source))
      throw new AgentUISourceError("PLUGIN_PURGE_STATE_CONFLICT", "Project source changed while preparing purge; inspect again.");
  }, options);
  return { pluginId: input.pluginId, changed: true, removedPluginIds: plan.removedPluginIds, removedInstanceIds: plan.removedInstanceIds.sort(), removedSourceItems: plan.managedItems,
    changedPaths: plan.files.map(file => file.path), appUIModelHash: plan.appUIModelHash, sourceStateHash: plan.sourceStateHash, verification: "passed" as const };
}
