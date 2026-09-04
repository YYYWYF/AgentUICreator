import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
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
  config: UIProjectControlConfig,
): Promise<PluginAssetInventory> {
  const pluginsRoot = path.join(projectRoot, "plugins");
  const excludedPaths = new Set([
    ...config.catalogs,
    ...(config.nonPluginDirectories ?? []),
  ]);
  const assets: PluginAsset[] = [];
  const errors: ProjectIssue[] = [];
  const entries = await readdir(pluginsRoot, { withFileTypes: true });

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
          message: `${relativeDirectory} is inside plugins/* but has no manifest.json. Declare it as a catalog or add a valid UI Plugin manifest.`,
        });
        continue;
      }
      errors.push({
        code: "plugin-manifest-read",
        message: `${projectPath(projectRoot, manifestPath)}: ${issueMessage(error)}`,
      });
      continue;
    }

    try {
      const manifest = parseUIPluginManifest(JSON.parse(source) as unknown);
      assets.push({
        pluginId: manifest.id,
        name: manifest.name,
        directory: entry.name,
        manifestPath: projectPath(projectRoot, manifestPath),
        definitionPath: projectPath(
          projectRoot,
          path.join(directoryPath, "definition.ts"),
        ),
        capabilities: [...(manifest.capabilities ?? [])].sort(),
        childSlots: [...(manifest.slots?.children ?? [])].sort(),
      });
    } catch (error) {
      errors.push({
        code: "plugin-manifest-invalid",
        message: `${projectPath(projectRoot, manifestPath)}: ${issueMessage(error)}`,
      });
    }
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
