import { isPluginApplication } from "./plugin-application";
import { readPluginSourceOwnership } from "./plugin-source-ownership";
import { lstat, readdir, readFile, rmdir } from "node:fs/promises";
import path from "node:path";
import { officialPackagePlugin, loadAgentUISourceRegistry, projectSourceRegistryRoot } from "../source-catalog/index.js";
import { resourcePaths } from "./optional-resource-paths";
import { projectRelativePath } from "./agent-ui-project-paths";
import { readAgentUISourceLock, serializeAgentUISourceLock } from "./source-registry/lock";
import { AgentUISourceError, assertNoSymbolicLinkTraversal } from "./source-registry/path-policy";
import { commitAgentUISourceTransaction, recoverPendingAgentUISourceTransaction } from "./source-registry/transaction";
import { createRequire } from "node:module";
import { generatePluginRegistry } from "./registry-generator";
import { parseAppUIModelJson } from "../framework/contracts/app-ui-model";

/** An explicit migration compares current source with the installed target only. */
export async function migrateOfficialPackagePlugin(projectRoot: string, pluginId = "composer") {
  const official = officialPackagePlugin(pluginId);
  if (!official) throw new AgentUISourceError("OFFICIAL_PACKAGE_PLUGIN_UNKNOWN", "No package delivery exists for this Plugin.");
  const { paths, config } = await resourcePaths(projectRoot);
  await recoverPendingAgentUISourceTransaction(projectRoot, config);
  if ((await readPluginSourceOwnership(paths.metadataRoot)).plugins[pluginId]) return { changed: false };
  const directory = path.join(paths.pluginsRoot, pluginId);
  if (await isPluginApplication(directory, pluginId)) return { changed: false };
  await assertNoSymbolicLinkTraversal(paths.sourceRoot, `plugins/${pluginId}`);
  const files: string[] = [];
  async function walk(root: string): Promise<void> {
    for (const entry of await readdir(root, { withFileTypes: true }).catch(error => { if (error.code === "ENOENT") return []; throw error; })) {
      if (entry.isSymbolicLink()) throw new AgentUISourceError("LEGACY_MODIFIED_OFFICIAL_PLUGIN", "Legacy Plugin has a symlink; port it to a custom ID.");
      if (entry.isDirectory()) await walk(path.join(root, entry.name));
      else files.push(path.relative(paths.sourceRoot, path.join(root, entry.name)).split(path.sep).join("/"));
    }
  }
  await walk(directory);
  if (!files.length) {
    if (await lstat(directory).then(() => true, error => { if (error.code === "ENOENT") return false; throw error; }))
      throw new AgentUISourceError("LEGACY_MODIFIED_OFFICIAL_PLUGIN", "Legacy Plugin has no implementation files; preserve it for explicit migration.");
    return { changed: false };
  }
  const { lock } = await readAgentUISourceLock(projectRoot, config);
  const target = (await loadAgentUISourceRegistry(projectSourceRegistryRoot(projectRoot))).byId.get(official.referenceSourceItemId);
  const fail = () => { throw new AgentUISourceError("LEGACY_MODIFIED_OFFICIAL_PLUGIN", "Current implementation differs from the installed package. Preserve it for an explicit project migration."); };
  if (!target || files.length !== target.loadedFiles.length) fail();
  for (const file of files) {
    const desired = target!.loadedFiles.find(entry => entry.target === file)?.content;
    if (!desired || !desired.equals(await readFile(path.join(paths.sourceRoot, ...file.split("/"))))) fail();
  }
  createRequire(path.join(projectRoot, "package.json")).resolve(official.runtime.package + official.runtime.subpath.slice(1));
  const nextLock = structuredClone(lock);
  delete nextLock.items[official.referenceSourceItemId];
  const model = parseAppUIModelJson(await readFile(paths.appUIModelPath, "utf8"));
  const generation = await generatePluginRegistry(projectRoot, model, { paths, config: {
    ...config, nonPluginDirectories: [...(config.nonPluginDirectories ?? []), path.relative(projectRoot, directory).split(path.sep).join("/")],
  } });
  const errors = generation.errors.filter(issue => issue.code !== "PLUGIN_ID_RESERVED_BY_OFFICIAL" || issue.pluginId !== pluginId);
  if (errors.length) throw new AgentUISourceError("OFFICIAL_PLUGIN_MIGRATION_INVALID", "Migration composition is invalid.", errors);
  await commitAgentUISourceTransaction(projectRoot, config, "migrate_official_package_plugin", [
    ...files.map(target => ({ target })),
    { target: projectRelativePath(paths.sourceRoot, paths.generatedPluginRegistryPath), content: Buffer.from(generation.capabilityCatalog.source) },
  ], serializeAgentUISourceLock(nextLock));
  await rmdir(directory).catch(error => { if (error.code !== "ENOTEMPTY" && error.code !== "ENOENT") throw error; });
  return { changed: true };
}
