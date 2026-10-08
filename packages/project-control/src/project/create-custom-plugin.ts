import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { officialPackagePlugin } from "@agent-ui/source-registry";
import { collectAppUIPluginLocations, parseAppUIModelJson } from "../framework/contracts/app-ui-model";
import { parseUIPluginManifest } from "../framework/contracts/ui-plugin";
import { assertCreatorCommitAllowed, creatorCancelMarkerSchemaPattern } from "./creator-cancel-marker";
import { resourcePaths } from "./optional-resource-paths";
import { generatePluginRegistry } from "./registry-generator";
import { AgentUISourceError, assertNoSymbolicLinkTraversal } from "./source-registry/path-policy";
import { readAgentUISourceLock, serializeAgentUISourceLock } from "./source-registry/lock";
import { commitAgentUISourceTransaction, recoverPendingAgentUISourceTransaction } from "./source-registry/transaction";
import { detectResourcePackageManager, runResourcePackageCommand, type ResourcePackageRunner } from "./ensure-resource-packages";

export const createCustomPluginInputSchema = z.strictObject({
  pluginId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/u),
  capabilities: z.array(z.string().min(1).max(200)).max(20).optional(),
  basedOn: z.literal("assistant-ui-composer").optional(),
  replaceInstanceId: z.string().min(1).max(200).optional(),
  placement: z.union([z.strictObject({ type: z.literal("application") }), z.strictObject({
    type: z.literal("plugin_slot"), parentInstanceId: z.string().min(1), slot: z.string().min(1),
  })]).optional(),
  /** A project-owned view built against public APIs, never a copied official implementation. */
  implementation: z.string().min(1).max(24000).optional(),
  cancelMarker: z.string().regex(creatorCancelMarkerSchemaPattern).optional(),
});
export type CreateCustomPluginInput = z.infer<typeof createCustomPluginInputSchema>;

/** Validate and build in isolation, then journal source, AppUIModel and registry together. */
export async function createCustomPlugin(projectRoot: string, raw: CreateCustomPluginInput,
  run: ResourcePackageRunner = runResourcePackageCommand) {
  const input = createCustomPluginInputSchema.parse(raw);
  if (officialPackagePlugin(input.pluginId)) throw new AgentUISourceError("PLUGIN_ID_RESERVED_BY_OFFICIAL", "Choose a new project-owned Plugin ID.");
  const { paths, config } = await resourcePaths(projectRoot);
  await recoverPendingAgentUISourceTransaction(projectRoot, config);
  const target = `plugins/${input.pluginId}`;
  await assertNoSymbolicLinkTraversal(paths.sourceRoot, target);
  try { await readFile(path.join(paths.sourceRoot, target, "manifest.json")); throw new AgentUISourceError("PLUGIN_ALREADY_EXISTS", "Custom Plugin already exists."); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  // Exclusive directory admission also rejects empty or malformed existing directories.
  const { lstat } = await import("node:fs/promises");
  try { await lstat(path.join(paths.sourceRoot, target)); throw new AgentUISourceError("PLUGIN_ALREADY_EXISTS", "Custom Plugin directory already exists."); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const basis = input.basedOn ? officialPackagePlugin(input.basedOn) : undefined;
  const manifest = parseUIPluginManifest({ ...(basis?.manifest ?? {}), id: input.pluginId,
    name: input.pluginId, description: "Project-owned UI Plugin", version: "0.0.1",
    capabilities: input.capabilities ?? basis?.manifest.capabilities ?? [],
    ...(input.capabilities && !input.capabilities.includes("conversation-composer") ? {
      slots: undefined, authoring: { intents: [`compose ${input.pluginId}`] },
    } : {}),
  });
  const implementation = input.implementation ?? (basis && (!input.capabilities || input.capabilities.includes("conversation-composer")) ?
    `import { ConversationCanonicalComposer } from "@agent-ui/react";\nimport type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";\n\nexport function CustomPlugin({ renderSlot }: UIPluginComponentProps) {\n  return <ConversationCanonicalComposer beforeInput={renderSlot("beforeInput")} leadingActions={renderSlot("leadingActions", null, { layout: "inline" })} trailingActions={renderSlot("trailingActions", null, { layout: "inline" })} submitAction={renderSlot("submitAction")} input={renderSlot("input")} triggers={renderSlot("triggers")} />;\n}\n` :
    `export function CustomPlugin() { return null; }\n`);
  const files = new Map<string, Buffer>([
    [`${target}/manifest.json`, Buffer.from(JSON.stringify(manifest, null, 2) + "\n")],
    [`${target}/definition.ts`, Buffer.from('import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";\nimport manifest from "./manifest.json";\nimport { CustomPlugin } from "./index";\nconst definition: UIPluginDefinition = { manifest: parseUIPluginManifest(manifest), Component: CustomPlugin };\nexport default definition;\n')],
    [`${target}/index.tsx`, Buffer.from(implementation)],
  ]);
  const originalModel = await readFile(paths.appUIModelPath, "utf8");
  const originalLock = await readAgentUISourceLock(projectRoot, config);
  const model = parseAppUIModelJson(originalModel);
  const locations = collectAppUIPluginLocations(model);
  if (input.replaceInstanceId) {
    const location = locations.find(location => location.plugin.id === input.replaceInstanceId);
    if (!location) throw new AgentUISourceError("PLUGIN_INSTANCE_MISSING", "Replacement instance does not exist.");
    if (input.basedOn && location.plugin.pluginId !== input.basedOn) throw new AgentUISourceError("PLUGIN_BASIS_MISMATCH", "Replacement does not match basedOn.");
    location.plugin.pluginId = input.pluginId;
  } else if (input.placement) {
    const node = { id: `${input.pluginId}-main`, pluginId: input.pluginId, enabled: true };
    if (locations.some(location => location.plugin.id === node.id)) throw new AgentUISourceError("PLUGIN_INSTANCE_CONFLICT", "Instance ID already exists.");
    if (input.placement.type === "application") (model.applicationPlugins ??= []).push(node);
    else {
      const parent = locations.find(location => location.plugin.id === (input.placement as { parentInstanceId: string }).parentInstanceId);
      if (!parent) throw new AgentUISourceError("PLUGIN_PARENT_MISSING", "Placement parent does not exist.");
      parent.plugin.slots ??= {};
      (parent.plugin.slots[input.placement.slot] ??= []).push(node);
    }
  }
  const modelTarget = path.relative(paths.sourceRoot, paths.appUIModelPath);
  files.set(modelTarget, Buffer.from(JSON.stringify(model, null, 2) + "\n"));
  const staged = await mkdtemp(path.join(tmpdir(), "agent-ui-custom-plugin-"));
  try {
    await cp(projectRoot, staged, { recursive: true, filter: source => !["node_modules", ".git", "dist", ".agentuicreator"].includes(path.relative(projectRoot, source).split(path.sep)[0]!) });
    await symlink(path.join(projectRoot, "node_modules"), path.join(staged, "node_modules"), "dir");
    const stagedContext = await resourcePaths(staged);
    for (const [file, content] of files) {
      const destination = path.join(stagedContext.paths.sourceRoot, file);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, content);
    }
    const generation = await generatePluginRegistry(staged, model, stagedContext);
    // A controlled full replacement can preserve a legacy official copy while
    // its behavior is ported. It is never selected or imported as local runtime.
    const pendingLegacyReplacement = input.basedOn && input.replaceInstanceId &&
      !generation.activeComposition.selectedPluginIds.includes(input.basedOn);
    const issues = generation.errors.filter(issue => !(pendingLegacyReplacement &&
      issue.code === "PLUGIN_ID_RESERVED_BY_OFFICIAL" && issue.pluginId === input.basedOn));
    if (issues.length) throw new AgentUISourceError("CUSTOM_PLUGIN_INVALID", "Custom Plugin composition is invalid.", issues);
    const registryTarget = path.relative(paths.sourceRoot, paths.generatedPluginRegistryPath);
    files.set(registryTarget, Buffer.from(generation.capabilityCatalog.source));
    await writeFile(stagedContext.paths.generatedPluginRegistryPath, generation.capabilityCatalog.source);
    const pkg = JSON.parse(await readFile(path.join(staged, "package.json"), "utf8")) as { scripts?: Record<string, string> };
    if (!pkg.scripts?.build) throw new AgentUISourceError("CUSTOM_PLUGIN_BUILD_REQUIRED", "The Host must provide a build script before creating a custom Plugin.");
    const manager = await detectResourcePackageManager(projectRoot);
    const checks: string[] = [];
    // Host scripts validate the actual generated project with its own toolchain.
    for (const name of ["typecheck", "build", "test"]) if (pkg.scripts?.[name]) {
      await run(staged, { command: manager, args: ["run", name] }); checks.push(name);
    }
    await assertCreatorCommitAllowed(projectRoot, input.cancelMarker);
    if (await readFile(paths.appUIModelPath, "utf8") !== originalModel) throw new AgentUISourceError("APP_UI_MODEL_HASH_CONFLICT", "AppUIModel changed during custom Plugin validation; retry against current facts.");
    const { lock } = await readAgentUISourceLock(projectRoot, config);
    if (!serializeAgentUISourceLock(lock).equals(serializeAgentUISourceLock(originalLock.lock))) throw new AgentUISourceError("AGENT_UI_SOURCE_STATE_CONFLICT", "Source ownership changed during validation.");
    try { await lstat(path.join(paths.sourceRoot, target)); throw new AgentUISourceError("PLUGIN_ALREADY_EXISTS", "Plugin directory was created during validation."); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    await commitAgentUISourceTransaction(projectRoot, config, "create_custom_plugin",
      [...files].map(([target, content]) => ({ target, content })), serializeAgentUISourceLock(lock));
    return { pluginId: input.pluginId, ownership: "project_source" as const,
      changedPaths: [...files.keys()].map(file => `${config.agentUI.sourceRoot}/${file}`), checks };
  } finally { await rm(staged, { recursive: true, force: true }); }
}
