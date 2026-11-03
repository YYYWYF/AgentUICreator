import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { ensurePluginApplication, installedPackagePluginIds } from "./plugin-application";
import { resourcePaths } from "./optional-resource-paths";
import { loadAgentUISourceRegistry, resolveAgentUISourceItemClosure } from "../source-catalog/index.js";
import { inspectAgentUIPackages } from "./source-registry/inspector";
import { ensureResourcePackages, resourcePackageConflicts, type ResourcePackageRunner } from "./ensure-resource-packages";
import { readPluginSourceOwnership } from "./plugin-source-ownership";
import { assertNoSymbolicLinkTraversal } from "./source-registry/path-policy";

export interface PluginEnablementPreparation {
  pluginId: string;
  stateHash: string;
  files: string[];
  packages: { name: string; required: string; declared?: string; installed?: string }[];
}

async function inspect(root: string, pluginId: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(pluginId) || !(await installedPackagePluginIds(root))?.has(pluginId)) throw new Error("PLUGIN_UNAVAILABLE");
  const { paths } = await resourcePaths(root);
  const catalogPath = createRequire(path.join(root, "package.json")).resolve("@za38.03/agent-ui-plugins/catalog.json");
  const catalogBytes = await readFile(catalogPath);
  const catalog = JSON.parse(catalogBytes.toString());
  const owned = Boolean((await readPluginSourceOwnership(paths.metadataRoot)).plugins[pluginId]);
  const registry = await loadAgentUISourceRegistry(path.join(path.dirname(catalogPath), "resources/registry"));
  // Requirements come from the target's installed snapshots, never the tool's release.
  const closure = owned ? [] : resolveAgentUISourceItemClosure(registry, `plugin/${pluginId}`).map(item => ({
    ...item, packages: { ...item.packages, ...(item.id.startsWith("plugin/") ? { [catalog.package.name]: catalog.package.version } : {}) },
  }));
  const dependencies = await inspectAgentUIPackages(root, closure);
  if (resourcePackageConflicts(dependencies.packages).length || dependencies.issues.some(issue => issue.code === "AGENT_UI_PACKAGE_INCOMPATIBLE")) throw new Error("PLUGIN_ENABLEMENT_DEPENDENCY_CONFLICT");
  const preview = owned ? { createdPaths: [] } : await ensurePluginApplication(root, pluginId, undefined, { preview: true, repair: true });
  const packages = dependencies.packages.filter(item => !item.declared || !item.compatible)
    .map(({ name, required, declared, installed }) => ({ name, required, ...(declared ? { declared } : {}), ...(installed ? { installed } : {}) }));
  const records: unknown[] = [await realpath(root), catalogBytes.toString(), dependencies.packages];
  const capture = async (file: string) => {
    const bytes = await readFile(file).catch(error => { if (error.code === "ENOENT") return undefined; throw error; });
    records.push([file, bytes ? createHash("sha256").update(bytes).digest("hex") : null]);
  };
  const tree = async (directory: string) => {
    const entries = await readdir(directory, { withFileTypes: true }).catch(error => { if (error.code === "ENOENT") return []; throw error; });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("PLUGIN_ENABLEMENT_SYMLINK_UNSUPPORTED");
      if (entry.isDirectory()) await tree(file); else await capture(file);
    }
  };
  await assertNoSymbolicLinkTraversal(paths.sourceRoot, `plugins/${pluginId}`);
  await tree(path.join(paths.pluginsRoot, pluginId));
  await assertNoSymbolicLinkTraversal(paths.sourceRoot, "services");
  await tree(path.join(paths.sourceRoot, "services"));
  for (const file of [paths.appUIModelPath, paths.projectConfigPath, paths.sourceLockPath, path.join(paths.metadataRoot, "plugin-ownership.json"), ...preview.createdPaths.map(file => path.resolve(root, file))]) await capture(file);
  // A workspace's package-manager state may belong to an ancestor directory.
  for (let directory = path.resolve(root); ; directory = path.dirname(directory)) {
    for (const name of ["package.json", "package-lock.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "yarn.lock", "bun.lock", "bun.lockb"]) await capture(path.join(directory, name));
    if (directory === path.dirname(directory)) break;
  }
  records.push(closure.map(item => item.loadedFiles.map(file => createHash("sha256").update(file.content).digest("hex"))));
  const preparation: PluginEnablementPreparation = { pluginId, stateHash: createHash("sha256").update(JSON.stringify(records)).digest("hex"), files: preview.createdPaths, packages };
  return { preparation, closure };
}

export async function preparePluginEnablement(root: string, pluginId: string): Promise<PluginEnablementPreparation> {
  return (await inspect(root, pluginId)).preparation;
}

/** Called only with a Host-held, user-confirmed preparation; no layout changes. */
export async function completePluginEnablement(root: string, expected: PluginEnablementPreparation, runPackages?: ResourcePackageRunner) {
  const { preparation, closure } = await inspect(root, expected.pluginId);
  if (preparation.stateHash !== expected.stateHash) throw new Error("PLUGIN_ENABLEMENT_PREPARATION_STALE");
  await ensureResourcePackages(root, closure, runPackages);
  const result = await ensurePluginApplication(root, expected.pluginId, undefined, { repair: true });
  const after = await preparePluginEnablement(root, expected.pluginId);
  if (after.files.length || after.packages.length) throw new Error("PLUGIN_ENABLEMENT_PREPARATION_INCOMPLETE");
  return result;
}
