import path from "node:path";
import { installedPackagePluginIds, isPluginApplication } from "./plugin-application";
import { resourcePaths } from "./optional-resource-paths";
import { readPluginSourceOwnership } from "./plugin-source-ownership";
import { acquireOperatorLock } from "./operator-lock";
import { planPluginSourceInputSchema, planPluginSourceTakeover, recoverPluginSourceTakeover, takeoverPluginSource } from "./takeover-plugin-source";

export interface PluginSourceTakeoverPlan {
  pluginId: string;
  package: { name: string; version: string };
  pluginVersion: string;
  catalogHash: string;
  stateHash: string;
  planHash: string;
  applicationChanges: string[];
  overwriteDirectory?: string;
  files: string[];
  instances: string[];
  sharedDependencies: string[];
  dependencyChanges: string[];
  compatibility: Record<string, number>;
  recommendations: { api: string; required: number; installed: unknown }[];
  origins: Record<string, string>;
}

export async function planAgentUIPluginSourceTakeover(root: string, input: { pluginId: string }): Promise<PluginSourceTakeoverPlan> {
  return planPluginSourceTakeover(root, input);
}

/** Include previous takeovers so users can explicitly extract the source again. */
export async function getAgentUIPluginSourceTargets(root: string): Promise<string[]> {
  const ids = await installedPackagePluginIds(root);
  if (!ids) return [];
  const { paths } = await resourcePaths(root);
  const ownership = await readPluginSourceOwnership(paths.metadataRoot);
  const targets: string[] = [];
  for (const id of ids) {
    planPluginSourceInputSchema.parse({ pluginId: id });
    if (ownership.plugins[id] || await isPluginApplication(path.join(paths.pluginsRoot, id), id)) targets.push(id);
  }
  return targets.sort();
}

/** The command Host holds the user's exact confirmed plan, separate from Agent runs. */
export async function applyAgentUIPluginSourceTakeover(root: string, input: { pluginId: string; planHash: string }) {
  const release = await acquireOperatorLock(root);
  try {
    await recoverPluginSourceTakeover(root);
    return await takeoverPluginSource(root, input);
  } finally { await release(); }
}
