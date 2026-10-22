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

/** Conservative, same-rule hints only; these do not evaluate the CSS cascade. */
export function pluginResponsiveRisks(rule: postcss.Rule, pluginId: string): string[] {
  const declarations = new Map<string, string>();
  rule.each((node) => {
    if (node.type === "decl") declarations.set(node.prop.toLowerCase(), node.value.trim().toLowerCase());
  });
  const risks: string[] = [];
  const hasPadding = [...declarations].some(([property, value]) =>
    /^padding(?:-(?:inline|left|right)(?:-start|-end)?)?$/u.test(property)
    && !/^(?:0(?:px|rem|em|%)?\s*)+$/u.test(value));
  if (declarations.get("width") === "100%" && hasPadding
    && declarations.get("box-sizing") !== "border-box") {
    risks.push("FULL_WIDTH_PADDING");
  }
  if (declarations.get("min-width") === "auto") risks.push("MIN_WIDTH_AUTO");
  // Root identity is explicit: Plugin ID class, ID-root class, plugin-root,
  // or a data-ui-plugin root. Do not guess arbitrary descendant selectors.
  const isRoot = splitSelectors(rule.selector).some((selector) =>
    selector === `.${pluginId}` || selector === `.${pluginId}-root`
    || selector === ".plugin-root" || /^\[data-ui-plugin(?:=[^\]]+)?\]$/u.test(selector));
  const fixedWidth = /^(\d+(?:\.\d+)?)px$/u.exec(declarations.get("width") ?? "");
  if (isRoot && fixedWidth && Number(fixedWidth[1]) > 279
    && declarations.get("max-width") !== "100%") risks.push("FIXED_ROOT_WIDTH");
  return risks;
}

export async function verifyPluginStyles(
  projectRoot: string,
  pluginsRoot: string,
  assets: readonly PluginAsset[],
  responsiveWarnings: ProjectIssue[] = [],
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
        for (const risk of pluginResponsiveRisks(rule, asset.pluginId)) {
          responsiveWarnings.push({ code: `PLUGIN_RESPONSIVE_${risk}`, pluginId: asset.pluginId,
            path: relativePath, file: relativePath, selector: rule.selector, line: rule.source?.start?.line ?? 1,
            message: `Plugin "${asset.pluginId}" has a possible narrow-slot layout risk (${risk}) in "${rule.selector}" at ${relativePath}:${rule.source?.start?.line ?? 1}. Review border-box sizing, min-width:0 and max-width:100% in the target styling system. This same-rule CSS hint does not evaluate cascade or prove browser overflow.` });
        }
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
