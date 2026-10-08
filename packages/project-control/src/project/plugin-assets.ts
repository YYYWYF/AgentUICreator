import { officialPackagePlugins, officialPackagePlugin } from "@agent-ui/source-registry";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { parseUIPluginManifest } from "../framework/contracts/ui-plugin";
import type { AgentUIProjectPaths } from "./agent-ui-project-paths";
import type {
  PluginAsset,
  PluginAssetInventory,
  ProjectIssue,
  UIProjectControlConfig,
} from "./types";

function projectPath(projectRoot: string, absolutePath: string): string {
  return path.relative(projectRoot, absolutePath).split(path.sep).join("/");
}

function issueMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function collectPluginAssets(
  projectRoot: string,
  paths: AgentUIProjectPaths,
  config: UIProjectControlConfig,
): Promise<PluginAssetInventory> {
  const pluginsRoot = paths.pluginsRoot;
  const excludedPaths = new Set([
    ...config.catalogs,
    ...(config.nonPluginDirectories ?? []),
  ]);
  const assets: PluginAsset[] = [];
  const errors: ProjectIssue[] = [];
  const entries = await readdir(pluginsRoot, { withFileTypes: true }).catch(error => { if (error.code === "ENOENT") return []; throw error; });

  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (!entry.isDirectory()) {
      continue;
    }

    const directoryPath = path.join(pluginsRoot, entry.name);
    const relativeDirectory = projectPath(projectRoot, directoryPath);
    if (excludedPaths.has(relativeDirectory)) {
      continue;
    }

    const manifestPath = path.join(directoryPath, "manifest.json");
    let source: string;
    try {
      source = await readFile(manifestPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        errors.push({
          code: "plugin-manifest-missing",
          path: projectPath(projectRoot, manifestPath),
          message: `${relativeDirectory} is inside plugins/* but has no manifest.json. Declare it as a catalog or add a valid UI Plugin manifest.`,
        });
        continue;
      }
      errors.push({
        code: "plugin-manifest-read",
          path: projectPath(projectRoot, manifestPath),
        message: `${projectPath(projectRoot, manifestPath)}: ${issueMessage(error)}`,
      });
      continue;
    }

    try {
      const manifest = parseUIPluginManifest(JSON.parse(source) as unknown);
      if (officialPackagePlugin(manifest.id)) {
        errors.push({ code: "PLUGIN_ID_RESERVED_BY_OFFICIAL", pluginId: manifest.id,
          path: projectPath(projectRoot, manifestPath),
          message: `Plugin ${manifest.id} is dependency-owned. Migrate unchanged legacy source or port custom behavior to a new project-owned ID.` });
        continue;
      }
      assets.push({
        ownership: "project_source",
        pluginId: manifest.id,
        manifest,
        name: manifest.name,
        description: manifest.description,
        directory: entry.name,
        manifestPath: projectPath(projectRoot, manifestPath),
        definitionPath: projectPath(
          projectRoot,
          path.join(directoryPath, "definition.ts"),
        ),
        capabilities: [...(manifest.capabilities ?? [])].sort(),
        ...(manifest.authoring === undefined
          ? {}
          : { authoring: structuredClone(manifest.authoring) }),
        ...(manifest.layout?.width === undefined
          ? {}
          : { layoutWidth: manifest.layout.width }),
        ...(manifest.application?.gate === undefined
          ? {}
          : {
              applicationGate: {
                service: manifest.application.gate.service,
                priority: manifest.application.gate.priority ?? 0,
              },
            }),
        childSlots: Object.fromEntries(
          Object.entries(manifest.slots?.children ?? {}).sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        ),
      });
    } catch (error) {
      errors.push({
        code: "plugin-manifest-invalid",
          path: projectPath(projectRoot, manifestPath),
        message: `${projectPath(projectRoot, manifestPath)}: ${issueMessage(error)}`,
      });
    }
  }

  for (const official of officialPackagePlugins) {
    const manifest = parseUIPluginManifest(official.manifest);
    const runtimeImport = official.runtime.package + official.runtime.subpath.slice(1);
    assets.push({ ownership: "official_package", pluginId: official.pluginId, manifest,
      name: manifest.name, description: manifest.description, directory: official.pluginId,
      manifestPath: official.referenceSourceItemId, definitionPath: runtimeImport, runtimeImport,
      referenceSourceItemId: official.referenceSourceItemId, capabilities: manifest.capabilities ?? [],
      authoring: manifest.authoring, childSlots: { ...manifest.slots?.children } });
  }
  const assetsById = new Map<string, PluginAsset[]>();
  for (const asset of assets) {
    const matches = assetsById.get(asset.pluginId) ?? [];
    matches.push(asset);
    assetsById.set(asset.pluginId, matches);
  }
  for (const [pluginId, matches] of assetsById) {
    if (matches.length > 1) {
      errors.push({
        code: "duplicate-plugin-id",
        pluginId,
        message: `UI plugin "${pluginId}" is declared by: ${matches
          .map((asset) => asset.manifestPath)
          .join(", ")}.`,
      });
    }
  }

  return {
    assets: assets.sort((left, right) =>
      left.pluginId === right.pluginId
        ? left.directory.localeCompare(right.directory)
        : left.pluginId.localeCompare(right.pluginId),
    ),
    errors,
  };
}
