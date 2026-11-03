import { installedPackagePluginIds } from "./plugin-application";
import { readFile } from "node:fs/promises";
import { resourcePaths } from "./optional-resource-paths";
import { projectRelativePath } from "./agent-ui-project-paths";
import { collectAppUIPluginLocations, parseAppUIModelJson } from "../framework/contracts/app-ui-model";
import { assertNoSymbolicLinkTraversal } from "./source-registry/path-policy";
import { acquireOperatorLock } from "./operator-lock";
import type { ThemeChange, ThemeTransactionResult } from "./agent-ui-theme";
import { generatePluginRegistry } from "./registry-generator";

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
      verificationRuntime: import.meta.resolve("@za38.03/agent-ui-creator/project/commands") });
    if (transaction.verification.status !== "passed") throw new Error("PLUGIN_STATIC_VALIDATION_FAILED");
    return { current: instanceId, changed, changedPaths: changed ? [state.relative] : [], validation: transaction.verification.status, ...transaction };
  } finally { await release(); }
}

export async function getAgentUIAvailablePluginIds(root: string): Promise<string[]> {
  return [...(await installedPackagePluginIds(root) ?? [])];
}
