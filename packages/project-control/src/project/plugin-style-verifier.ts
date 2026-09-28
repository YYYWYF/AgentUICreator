import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import postcss from "postcss";

import type { PluginAsset, ProjectIssue } from "./types";

const EXCLUDED_DIRECTORIES = new Set(["__tests__", "dist", "node_modules"]);
const PLUGIN_SELECTOR = /^(?:\.[\w-]+|\[data-(?:ui-plugin|plugin-id)(?=[\]\s=~|^$*]))/u;
const HOST_ROOT_SELECTOR = /(?:^|[\s>+~])(?:html|body|:root)(?=$|[\s.#:[>+~])/iu;

function splitSelectors(selectorList: string): string[] {
  const selectors: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: string | undefined;
  for (let index = 0; index < selectorList.length; index++) {
    const char = selectorList[index];
    if (char === "\\") { index++; continue; }
    if (quote !== undefined) {
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (char === "(" || char === "[") depth++;
    if (char === ")" || char === "]") depth--;
    if (char === "," && depth === 0) {
      selectors.push(selectorList.slice(start, index).trim());
      start = index + 1;
    }
  }
  selectors.push(selectorList.slice(start).trim());
  return selectors;
}

function hasPluginOwnedParent(rule: postcss.Rule): boolean {
  let parent = rule.parent;
  while (parent !== undefined && parent.type !== "root") {
    if (parent.type === "rule") {
      return splitSelectors(parent.selector).every((selector) =>
        PLUGIN_SELECTOR.test(selector) && !HOST_ROOT_SELECTOR.test(selector));
    }
    parent = parent.parent;
  }
  return false;
}

async function cssFiles(directory: string): Promise<string[]> {
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
      files.push(...await cssFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".css")) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

export async function verifyPluginStyles(
  projectRoot: string,
  pluginsRoot: string,
  assets: readonly PluginAsset[],
): Promise<ProjectIssue[]> {
  const issues: ProjectIssue[] = [];
  for (const asset of assets) {
    for (const filePath of await cssFiles(path.join(pluginsRoot, asset.directory))) {
      const relativePath = path.relative(projectRoot, filePath).split(path.sep).join("/");
      let stylesheet;
      try {
        stylesheet = postcss.parse(await readFile(filePath, "utf8"), { from: filePath });
      } catch (error) {
        issues.push({ code: "PLUGIN_STYLE_INVALID_CSS", pluginId: asset.pluginId,
          message: `${relativePath}: ${error instanceof Error ? error.message : String(error)}` });
        continue;
      }
      stylesheet.walkAtRules("import", (rule) => {
        issues.push({ code: "PLUGIN_STYLE_GLOBAL_SELECTOR_NOT_ALLOWED", pluginId: asset.pluginId,
          message: `Plugin "${asset.pluginId}" imports CSS from ${relativePath}:${rule.source?.start?.line ?? 1}. Plugin styles must be scoped under a Plugin-owned root selector.` });
      });
      stylesheet.walkRules((rule) => {
        if (rule.parent?.type === "atrule" && /keyframes$/u.test(rule.parent.name)) return;
        for (const selector of splitSelectors(rule.selector)) {
          if (selector.startsWith("&") && hasPluginOwnedParent(rule)) continue;
          if (PLUGIN_SELECTOR.test(selector) && !HOST_ROOT_SELECTOR.test(selector)) continue;
          issues.push({ code: "PLUGIN_STYLE_GLOBAL_SELECTOR_NOT_ALLOWED", pluginId: asset.pluginId,
            message: `Plugin "${asset.pluginId}" contains global selector "${selector}" at ${relativePath}:${rule.source?.start?.line ?? 1}. Plugin styles must be scoped under a Plugin-owned root selector.` });
        }
      });
    }
  }
  return issues;
}
