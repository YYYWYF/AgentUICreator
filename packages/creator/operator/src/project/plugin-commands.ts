import { resolve as resolveModule } from "import-meta-resolve";
import { installedPackagePluginIds } from "./plugin-application";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resourcePaths } from "./optional-resource-paths";
import { projectRelativePath } from "./agent-ui-project-paths";
import { collectAppUIPluginLocations, parseAppUIModelJson } from "../framework/contracts/app-ui-model";
import { assertNoSymbolicLinkTraversal } from "./source-registry/path-policy";
import { acquireOperatorLock } from "./operator-lock";
import type { ThemeChange, ThemeTransactionResult } from "./agent-ui-theme";
import { generatePluginRegistry } from "./registry-generator";
import { collectPluginAssets } from "./plugin-assets";
import { isVisualAsset } from "./creator-action-planners";
import { mutateAppUIModel } from "./app-ui-transaction";

/** Read-only derivation for the Host's shared AppUIModel/registry transaction. */
export async function planAgentUIPluginRegistry(root: string, modelSource: string) {
  const { paths, config } = await resourcePaths(root);
  const relative = projectRelativePath(root, paths.generatedPluginRegistryPath);
  await assertNoSymbolicLinkTraversal(root, relative);
  const before = await readFile(paths.generatedPluginRegistryPath, "utf8");
  const generation = await generatePluginRegistry(root, parseAppUIModelJson(modelSource), { paths, config });
  if (generation.errors.length) throw new Error(JSON.stringify({ errors: generation.errors }));
  return { path: relative, before, after: generation.capabilityCatalog.source };
}

async function inspect(root: string) {
  const { paths } = await resourcePaths(root);
  const relative = projectRelativePath(root, paths.appUIModelPath);
  await assertNoSymbolicLinkTraversal(root, relative);
  const source = await readFile(paths.appUIModelPath, "utf8");
  const model = parseAppUIModelJson(source);
  return { relative, source, model, locations: collectAppUIPluginLocations(model) };
}
export async function getAgentUIPluginInstances(root: string) {
  return (await inspect(root)).locations.map(({ plugin }) => ({ id: plugin.id, pluginId: plugin.pluginId, enabled: plugin.enabled !== false }));
}
/** Only existing instances can be toggled; installation and source ownership are separate. */
export async function setAgentUIPluginEnabled(root: string, instanceId: string, enabled: boolean, commit: (change: ThemeChange) => Promise<ThemeTransactionResult>) {
  const release = await acquireOperatorLock(root);
  try {
    const state = await inspect(root);
    const matches = state.locations.filter(({ plugin }) => plugin.id === instanceId);
    if (matches.length !== 1) throw new Error("PLUGIN_INSTANCE_UNKNOWN");
    const plugin = matches[0]!.plugin;
    const raw = JSON.parse(state.source);
    const rawPlugin = collectAppUIPluginLocations(raw)[state.locations.indexOf(matches[0]!)]!.plugin;
    const changed = (plugin.enabled !== false) !== enabled;
    rawPlugin.enabled = enabled;
    const after = changed ? JSON.stringify(raw, null, 2) + "\n" : state.source;
    const transaction = await commit({ path: state.relative, before: state.source, after,
      verificationRuntime: resolveModule("@za38.03/agent-ui-creator/project/commands", import.meta.url) });
    if (transaction.verification.status !== "passed") throw new Error("PLUGIN_STATIC_VALIDATION_FAILED");
    return { current: instanceId, changed, changedPaths: changed ? [state.relative] : [], validation: transaction.verification.status, ...transaction };
  } finally { await release(); }
}

export async function getAgentUIAvailablePluginIds(root: string): Promise<string[]> {
  return [...(await installedPackagePluginIds(root) ?? [])];
}

export interface AgentUIPluginPlacementGuide {
  modelPath: string;
  pluginId: string;
  example: string;
  target?: { parentPluginId: string; slot: string; cardinality?: "one" | "many" };
}

function nextPluginInstanceId(pluginId: string, locations: ReturnType<typeof collectAppUIPluginLocations>): string {
  const ids = new Set(locations.map(({ plugin }) => plugin.id));
  let id = `${pluginId}-main`;
  for (let suffix = 2; ids.has(id); suffix++) id = `${pluginId}-main-${suffix}`;
  return id;
}

/** Read-only guidance for the actual project layout and installed Plugin contract. */
export async function getAgentUIPluginPlacementGuide(root: string, pluginId: string): Promise<AgentUIPluginPlacementGuide> {
  const state = await inspect(root);
  const { paths, config } = await resourcePaths(root);
  const inventory = await collectPluginAssets(root, paths, config);
  const matches = inventory.assets.filter(asset => asset.pluginId === pluginId);
  if (matches.length !== 1) throw new Error("PLUGIN_UNAVAILABLE");
  const plugin = { id: nextPluginInstanceId(pluginId, state.locations), pluginId, enabled: true };
  const placement = matches[0]!.authoring?.defaultPlacement;
  if (placement?.type === "plugin_slot") {
    const parents = inventory.assets.filter(asset => asset.pluginId === placement.parentPluginId);
    const cardinality = parents.length === 1 ? parents[0]?.childSlots?.[placement.slot]?.cardinality : undefined;
    return {
      modelPath: state.relative, pluginId,
      target: { parentPluginId: placement.parentPluginId, slot: placement.slot, ...(cardinality ? { cardinality } : {}) },
      example: JSON.stringify({ pluginId: placement.parentPluginId, slots: { [placement.slot]: [plugin] } }, null, 2),
    };
  }
  return { modelPath: state.relative, pluginId, example: JSON.stringify(plugin, null, 2) };
}

/** Add an official Plugin using the installed manifest and the canonical composition transaction. */
export async function addAgentUIPlugin(root: string, pluginId: string) {
  if (!(await installedPackagePluginIds(root))?.has(pluginId)) throw new Error("PLUGIN_UNAVAILABLE");
  const state = await inspect(root);
  if (state.locations.some(({ plugin }) => plugin.pluginId === pluginId)) throw new Error("PLUGIN_COMMAND_STALE");
  const { paths, config } = await resourcePaths(root);
  const inventory = await collectPluginAssets(root, paths, config);
  const matches = inventory.assets.filter(asset => asset.pluginId === pluginId);
  if (matches.length !== 1) throw new Error("PLUGIN_UNAVAILABLE");
  const id = nextPluginInstanceId(pluginId, state.locations);
  const plugin = { id, pluginId, enabled: true };
  return mutateAppUIModel(root, {
    appUIModelHash: createHash("sha256").update(state.source).digest("hex"),
    operations: [isVisualAsset(matches[0])
      ? { type: "insert_plugin_default", plugin }
      : { type: "insert_plugin", target: { type: "application" }, plugin }],
  });
}
