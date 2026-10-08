import { lstat, readdir, readFile, rmdir } from "node:fs/promises";
import path from "node:path";
import { officialPackagePlugin } from "@agent-ui/source-registry";
import { resourcePaths } from "./optional-resource-paths";
import { readAgentUISourceLock, serializeAgentUISourceLock, sha256 } from "./source-registry/lock";
import { AgentUISourceError, assertNoSymbolicLinkTraversal } from "./source-registry/path-policy";
import { commitAgentUISourceTransaction, recoverPendingAgentUISourceTransaction } from "./source-registry/transaction";
import { createRequire } from "node:module";
import { generatePluginRegistry } from "./registry-generator";
import { parseAppUIModelJson } from "../framework/contracts/app-ui-model";

/** Only a complete, unchanged installed baseline may be removed automatically. */
export async function migrateOfficialPackagePlugin(projectRoot: string, pluginId = "assistant-ui-composer") {
  const official = officialPackagePlugin(pluginId);
  if (!official) throw new AgentUISourceError("OFFICIAL_PACKAGE_PLUGIN_UNKNOWN", "No package delivery exists for this Plugin.");
  const { paths, config } = await resourcePaths(projectRoot);
  await recoverPendingAgentUISourceTransaction(projectRoot, config);
  const directory = path.join(paths.pluginsRoot, pluginId);
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
      throw new AgentUISourceError("LEGACY_MODIFIED_OFFICIAL_PLUGIN", "Legacy Plugin has no complete baseline; preserve it for custom migration.");
    return { changed: false };
  }
  const { lock } = await readAgentUISourceLock(projectRoot, config);
  const baseline = lock.items[official.referenceSourceItemId];
  const fail = () => { throw new AgentUISourceError("LEGACY_MODIFIED_OFFICIAL_PLUGIN", "Legacy official source differs from its installed baseline. Preserve it and semantically port custom behavior to a new Plugin ID."); };
  if (!baseline || files.length !== Object.keys(baseline.files).length) fail();
  for (const file of files) if (baseline!.files[file]?.sha256 !== sha256(await readFile(path.join(paths.sourceRoot, file)))) fail();
  createRequire(path.join(projectRoot, "package.json")).resolve(official.runtime.package + official.runtime.subpath.slice(1));
  const nextLock = structuredClone(lock);
  delete nextLock.items[official.referenceSourceItemId];
  const model = parseAppUIModelJson(await readFile(paths.appUIModelPath, "utf8"));
  const generation = await generatePluginRegistry(projectRoot, model, { paths, config });
  const errors = generation.errors.filter(issue => issue.code !== "PLUGIN_ID_RESERVED_BY_OFFICIAL" || issue.pluginId !== pluginId);
  if (errors.length) throw new AgentUISourceError("OFFICIAL_PLUGIN_MIGRATION_INVALID", "Migration composition is invalid.", errors);
  await commitAgentUISourceTransaction(projectRoot, config, "migrate_official_package_plugin", [
    ...files.map(target => ({ target })),
    { target: path.relative(paths.sourceRoot, paths.generatedPluginRegistryPath), content: Buffer.from(generation.capabilityCatalog.source) },
  ], serializeAgentUISourceLock(nextLock));
  await rmdir(directory).catch(error => { if (error.code !== "ENOTEMPTY" && error.code !== "ENOENT") throw error; });
  return { changed: true };
}
