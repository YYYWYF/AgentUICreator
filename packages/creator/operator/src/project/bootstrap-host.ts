import { lstat, mkdir, rmdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  AgentUIInitializationError,
  type AgentUIProjectConfig,
} from "../bootstrap/index.js";
import { installManagedOperator, MANAGED_OPERATOR_ENTRY } from "../install.mjs";
import { officialPackagePlugins, loadAgentUISourceRegistry } from "../source-catalog/index.js";

import { parseAppUIModel, type AppUIModel } from "../framework/contracts/app-ui-model";
import { stringifyAppUIModel } from "./app-ui-serialization";
import { writeGeneratedPluginRegistry } from "../generate-plugin-registry";
import { verifyUIProject } from "../verify-ui";
import { resolveAgentUIProjectPaths, operatorConfigForPaths, projectRelativePath } from "./agent-ui-project-paths";
import { inspectCreatorProject } from "./creator-project-inspector";
import { inspectAgentUIPackages } from "./source-registry/inspector";
import { installAgentUISourceItems, resolveAgentUISourceItems } from "./source-registry/installer";
import { recoverPendingAgentUISourceTransaction } from "./source-registry/transaction";
import { assertNoSymbolicLinkTraversal, resolveAgentUISourceRoots } from "./source-registry/path-policy";

async function exists(filePath: string): Promise<boolean> {
  try { await lstat(filePath); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function context(projectRoot: string, projectConfig: AgentUIProjectConfig) {
  const paths = resolveAgentUIProjectPaths(projectRoot, projectConfig);
  return { paths, config: operatorConfigForPaths(paths) };
}

function plannedPluginApplicationPaths(projectRoot: string, projectConfig: AgentUIProjectConfig, paths: ReturnType<typeof resolveAgentUIProjectPaths>, selected: ReadonlySet<string>) {
  return officialPackagePlugins.filter(plugin => plugin.application.enabled && selected.has(plugin.pluginId)).flatMap(plugin => {
    const modeFiles = plugin.application.modeApplicationFiles as Partial<Record<import("../framework/contracts/agent-ui-mode").AgentUIMode, readonly (readonly [string, string])[]>> | undefined;
    const files = new Set(["application.json","manifest.json","index.tsx","definition.ts",...(modeFiles?.[projectConfig.mode] ?? []).map(([target]) => target)]);
    return [...files].map(file => projectRelativePath(projectRoot,path.join(paths.pluginsRoot,plugin.pluginId,...file.split("/"))));
  });
}

/** Generated-project Host adapter for the reusable bootstrap transaction. */
export function createAgentUIInitializationHost() {
  return {
    inspectProject: inspectCreatorProject,
    installOperatorEntry: installManagedOperator,
    parseAppUIModel,
    async preflightSources(projectRoot, itemIds, projectConfig) {
      const { paths, config } = context(projectRoot, projectConfig);
      await resolveAgentUISourceRoots(projectRoot, config);
      if (await exists(paths.sourceLockPath)) {
        throw new AgentUIInitializationError("AGENT_UI_PROJECT_INVALID_STATE", "An uninitialized project already has source-lock.json.");
      }
      const registry = await loadAgentUISourceRegistry();
      const items = resolveAgentUISourceItems(registry, itemIds);
      const applicationPaths = plannedPluginApplicationPaths(projectRoot,projectConfig,paths,new Set(items.filter(item => item.id.startsWith("plugin/")).map(item => item.id.slice(7))));
      for(const file of applicationPaths){
        await assertNoSymbolicLinkTraversal(projectRoot,file);
        if(await exists(path.join(projectRoot,file))) throw new AgentUIInitializationError("AGENT_UI_PROJECT_INVALID_STATE","Existing Plugin application files must be preserved.");
      }
      const packageInspection = await inspectAgentUIPackages(projectRoot, items);
      if (packageInspection.issues.length > 0) {
        throw new AgentUIInitializationError(
          "AGENT_UI_PACKAGE_REQUIREMENTS_UNMET",
          "Agent UI package requirements are not installed or are incompatible.",
          packageInspection.issues,
        );
      }
      return {
        plannedPaths: [
          ...applicationPaths,
          MANAGED_OPERATOR_ENTRY,
          ...items.flatMap((item) => item.loadedFiles.map((file) =>
            projectRelativePath(projectRoot, path.join(paths.sourceRoot, file.target)))),
          projectRelativePath(projectRoot, paths.sourceLockPath),
          projectRelativePath(projectRoot, paths.appUIModelPath),
          projectRelativePath(projectRoot, paths.generatedRuntimeConfigPath),
          projectRelativePath(projectRoot, paths.generatedPluginRegistryPath),
        ],
      };
    },
    async installSources(projectRoot, itemIds, projectConfig) {
      const { config } = context(projectRoot, projectConfig);
      return installAgentUISourceItems(projectRoot, itemIds, config);
    },
    async writeAppUIModel(projectRoot, model, projectConfig) {
      const { paths } = context(projectRoot, projectConfig);
      await mkdir(path.dirname(paths.appUIModelPath), { recursive: true });
      await writeFile(paths.appUIModelPath, stringifyAppUIModel(model), { flag: "wx" });
      return projectRelativePath(projectRoot, paths.appUIModelPath);
    },
    async writeGeneratedRuntimeConfig(projectRoot, projectConfig) {
      const { paths } = context(projectRoot, projectConfig);
      await mkdir(path.dirname(paths.generatedRuntimeConfigPath), { recursive: true });
      const shellName = `${projectConfig.mode[0]!.toUpperCase()}${projectConfig.mode.slice(1)}Shell`;
      await writeFile(paths.generatedRuntimeConfigPath, [
        "/** Fixed shell selected during initialization. Project-owned application code. */",
        `export { ${shellName} as ProjectShell } from "./shell/${shellName}";`,
        "",
      ].join("\n"), { flag: "wx" });
      return projectRelativePath(projectRoot, paths.generatedRuntimeConfigPath);
    },
    async writeGeneratedRegistry(projectRoot, projectConfig, onCreatedPaths) {
      const result = await writeGeneratedPluginRegistry(projectRoot, {
        projectConfigOverride: projectConfig,
        onCreatedPaths,
      });
      return result.path;
    },
    async verifyProject(projectRoot, projectConfig) {
      const result = await verifyUIProject(projectRoot, undefined, { projectConfigOverride: projectConfig });
      return { status: result.status, errors: result.errors };
    },
    async rollbackCreatedPaths(projectRoot, createdPaths, projectConfig, plannedPaths, sourceRootWasMissing) {
      const { config, paths } = context(projectRoot, projectConfig);
      await recoverPendingAgentUISourceTransaction(projectRoot, config);
      const applicationPaths = new Set(plannedPluginApplicationPaths(projectRoot,projectConfig,paths,new Set(officialPackagePlugins.map(plugin => plugin.pluginId))));
      for (const relativePath of [...new Set([...createdPaths, ...plannedPaths.filter(file=>applicationPaths.has(file))])].sort((left, right) => right.localeCompare(left))) {
        await assertNoSymbolicLinkTraversal(projectRoot, relativePath);
        await unlink(path.join(projectRoot, relativePath)).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        });
      }
      const directories = new Set<string>();
      for (const relativePath of [...plannedPaths, ...createdPaths]) {
        let parent = path.dirname(path.join(projectRoot, relativePath));
        let withinSourceRoot = path.relative(paths.sourceRoot, parent);
        while (withinSourceRoot !== "" && withinSourceRoot !== ".." &&
               !withinSourceRoot.startsWith(`..${path.sep}`) && !path.isAbsolute(withinSourceRoot)) {
          directories.add(parent);
          parent = path.dirname(parent);
          withinSourceRoot = path.relative(paths.sourceRoot, parent);
        }
      }
      for (const directory of [...directories].sort((left, right) => right.length - left.length)) {
        await rmdir(directory).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT" && error.code !== "ENOTEMPTY") throw error;
        });
      }
      await rmdir(path.join(projectRoot, ".agent-ui/operator")).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT" && error.code !== "ENOTEMPTY") throw error;
      });
      if (sourceRootWasMissing) {
        await rmdir(paths.sourceRoot).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT" && error.code !== "ENOTEMPTY") throw error;
        });
      }
    },
  } satisfies import("../bootstrap/index.js").AgentUIInitializationHost<AppUIModel>;
}
