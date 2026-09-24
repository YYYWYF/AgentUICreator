import { lstat, mkdir, rmdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  AgentUIInitializationError,
  initializeAgentUIProject as initializeBootstrapProject,
  type AgentUIProjectConfigV2,
  type InitializeAgentUIProjectInput,
} from "@agent-ui/bootstrap";
import { loadAgentUISourceRegistry } from "@agent-ui/source-registry";

import { parseAppUIModel, type AppUIModel } from "../../framework/contracts/app-ui-model";
import { writeGeneratedPluginRegistry } from "../generate-plugin-registry";
import { verifyUIProject } from "../verify-ui";
import { resolveAgentUIProjectPaths, projectControlConfigForPaths, projectRelativePath } from "./agent-ui-project-paths";
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

function context(projectRoot: string, projectConfig: AgentUIProjectConfigV2) {
  const paths = resolveAgentUIProjectPaths(projectRoot, projectConfig);
  return { paths, config: projectControlConfigForPaths(paths) };
}

/** Generated-project Host adapter for the reusable bootstrap transaction. */
export async function initializeAgentUIProject(input: InitializeAgentUIProjectInput) {
  return initializeBootstrapProject<AppUIModel>(input, {
    inspectProject: inspectCreatorProject,
    parseAppUIModel,
    async preflightSources(projectRoot, itemIds, projectConfig) {
      const { paths, config } = context(projectRoot, projectConfig);
      await resolveAgentUISourceRoots(projectRoot, config);
      if (await exists(paths.sourceLockPath)) {
        throw new AgentUIInitializationError("AGENT_UI_PROJECT_INVALID_STATE", "An uninitialized project already has source-lock.json.");
      }
      const registry = await loadAgentUISourceRegistry();
      const items = resolveAgentUISourceItems(registry, itemIds);
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
          ...items.flatMap((item) => item.loadedFiles.map((file) =>
            projectRelativePath(projectRoot, path.join(paths.sourceRoot, file.target)))),
          projectRelativePath(projectRoot, paths.sourceLockPath),
          projectRelativePath(projectRoot, paths.appUIModelPath),
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
      await writeFile(paths.appUIModelPath, `${JSON.stringify(model, null, 2)}\n`, { flag: "wx" });
      return projectRelativePath(projectRoot, paths.appUIModelPath);
    },
    async writeGeneratedRegistry(projectRoot, projectConfig) {
      const result = await writeGeneratedPluginRegistry(projectRoot, { projectConfigOverride: projectConfig });
      return result.path;
    },
    async verifyProject(projectRoot, projectConfig) {
      const result = await verifyUIProject(projectRoot, undefined, { projectConfigOverride: projectConfig });
      return { status: result.status, errors: result.errors };
    },
    async rollbackCreatedPaths(projectRoot, createdPaths, projectConfig, plannedPaths, sourceRootWasMissing) {
      const { config, paths } = context(projectRoot, projectConfig);
      await recoverPendingAgentUISourceTransaction(projectRoot, config);
      for (const relativePath of [...new Set(createdPaths)].sort((left, right) => right.localeCompare(left))) {
        await assertNoSymbolicLinkTraversal(projectRoot, relativePath);
        await unlink(path.join(projectRoot, relativePath)).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        });
      }
      const directories = new Set<string>();
      for (const relativePath of plannedPaths) {
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
      if (sourceRootWasMissing) {
        await rmdir(paths.sourceRoot).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT" && error.code !== "ENOTEMPTY") throw error;
        });
      }
    },
  });
}
