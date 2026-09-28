import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import type { PluginAsset, ProjectIssue } from "./types";

const EXCLUDED_DIRECTORIES = new Set(["__tests__", "dist", "node_modules"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs", ".cts", ".cjs"]);
const DIRECT_PORTAL_IMPORT = /\b(?:from\s*|import\s*(?:\(\s*)?|require\s*\(\s*)["'](@base-ui\/react\/(?:dialog|popover|tooltip|sheet)(?:\/[^"']*)?)["']/gu;

async function sourceFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory() && !EXCLUDED_DIRECTORIES.has(entry.name)) {
      files.push(...await sourceFiles(entryPath));
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

export async function verifyPluginPortalImports(
  projectRoot: string,
  pluginsRoot: string,
  assets: readonly PluginAsset[],
): Promise<ProjectIssue[]> {
  const issues: ProjectIssue[] = [];
  for (const asset of assets) {
    for (const filePath of await sourceFiles(path.join(pluginsRoot, asset.directory))) {
      const source = await readFile(filePath, "utf8");
      const relativePath = path.relative(projectRoot, filePath).split(path.sep).join("/");
      for (const match of source.matchAll(DIRECT_PORTAL_IMPORT)) {
        const line = source.slice(0, match.index).split("\n").length;
        issues.push({
          code: "PLUGIN_PORTAL_PRIMITIVE_IMPORT_NOT_ALLOWED",
          pluginId: asset.pluginId,
          message: `${relativePath}:${line}: Plugin "${asset.pluginId}" imports ${match[1]}. Use the Portal-aware AgentUIDialog, AgentUIPopover, AgentUITooltip, or corresponding official facade from @agent-ui/react.`,
        });
      }
    }
  }
  return issues;
}
