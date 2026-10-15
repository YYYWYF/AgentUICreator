import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import type {
  Node,
  StringLiteralLikeNode,
} from "typescript/unstable/ast";
import {
  isCallExpression,
  isExportDeclaration,
  isExternalModuleReference,
  isIdentifier,
  isImportDeclaration,
  isImportExpression,
  isImportTypeNode,
  isLiteralTypeNode,
  isStringLiteralLikeNode,
} from "typescript/unstable/ast/is";
import { createScanner } from "typescript/unstable/ast/scanner";
import { SyntaxKind } from "typescript/unstable/ast";
import { API, SymbolFlags, type Project } from "typescript/unstable/sync";
import type { AgentUIProjectPaths } from "./agent-ui-project-paths";

export const MAX_PLUGIN_SOURCE_REFERENCES = 200;

const SOURCE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
];
const STYLE_EXTENSIONS = [".css", ".scss", ".sass", ".less"];

export interface PluginSourceReference {
  path: string;
  line: number;
  column: number;
  kind: "module" | "plugin-id-literal" | "plugin-id-manifest";
  value: string;
}

export interface PluginSourceReferenceInspection {
  pluginId: string;
  directory: string;
  references: PluginSourceReference[];
  truncated: boolean;
}

function projectPath(projectRoot: string, filePath: string): string {
  return path.relative(projectRoot, filePath).split(path.sep).join("/");
}

function isWithin(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function sourceScope(projectRoot: string, targetPluginRoot: string, filePath: string): boolean {
  const resolved = path.resolve(filePath);
  if (!isWithin(projectRoot, resolved) || isWithin(targetPluginRoot, resolved)) return false;
  const parts = path.relative(projectRoot, resolved).split(path.sep);
  return !parts.some(part => ["node_modules", "dist", "build", ".git", ".agentuicreator"].includes(part));
}

function moduleReference(node: StringLiteralLikeNode): boolean {
  const parent = node.parent;
  return (
    (isImportDeclaration(parent) && parent.moduleSpecifier === node) ||
    (isExportDeclaration(parent) && parent.moduleSpecifier === node) ||
    (isExternalModuleReference(parent) && parent.expression === node) ||
    (isLiteralTypeNode(parent) && isImportTypeNode(parent.parent)) ||
    (isCallExpression(parent) &&
      parent.arguments[0] === node &&
      (isImportExpression(parent.expression) ||
        (isIdentifier(parent.expression) &&
          parent.expression.text === "require")))
  );
}

function jsonContainsExactString(value: unknown, expected: string): boolean {
  if (value === expected) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some((item) => jsonContainsExactString(item, expected));
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).some((item) =>
      jsonContainsExactString(item, expected),
    );
  }
  return false;
}

async function collectFiles(
  directoryPath: string,
  accept: (filePath: string) => boolean,
): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (["node_modules", "dist", "build", ".git", ".agentuicreator"].includes(entry.name)) {
      continue;
    }
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath, accept)));
    } else if (entry.isFile() && accept(entryPath)) {
      files.push(entryPath);
    }
  }
  return files;
}

function compilerResolvesInside(
  project: Project,
  node: StringLiteralLikeNode,
  targetPluginRoot: string,
): boolean {
  const symbolInside = (candidate: Node): boolean => {
    const symbol = project.checker.getSymbolAtLocation(candidate);
    if (symbol === undefined) {
      return false;
    }
    const resolved =
      (symbol.flags & SymbolFlags.Alias) === 0
        ? symbol
        : project.checker.getAliasedSymbol(symbol);
    return [...symbol.declarations, ...resolved.declarations].some((declaration) =>
      isWithin(targetPluginRoot, path.resolve(declaration.path)),
    );
  };
  if (symbolInside(node)) {
    return true;
  }
  const parent = node.parent;
  const bindingRoot = isImportDeclaration(parent)
    ? parent.importClause
    : isExportDeclaration(parent)
      ? parent.exportClause
      : undefined;
  if (bindingRoot === undefined) {
    return false;
  }
  let found = false;
  const visit = (candidate: Node): void => {
    if (!found && isIdentifier(candidate) && symbolInside(candidate)) {
      found = true;
      return;
    }
    candidate.forEachChild(visit);
  };
  visit(bindingRoot);
  return found;
}

function compilerPathMappingInside(
  paths: Record<string, string[]>,
  configDirectory: string,
  moduleName: string,
  targetPluginRoot: string,
): boolean {
  for (const [pattern, targets] of Object.entries(paths)) {
    const wildcardIndex = pattern.indexOf("*");
    const prefix = wildcardIndex < 0 ? pattern : pattern.slice(0, wildcardIndex);
    const suffix = wildcardIndex < 0 ? "" : pattern.slice(wildcardIndex + 1);
    if (
      !moduleName.startsWith(prefix) ||
      !moduleName.endsWith(suffix) ||
      (wildcardIndex < 0 && moduleName !== pattern)
    ) {
      continue;
    }
    const wildcard = moduleName.slice(
      prefix.length,
      moduleName.length - suffix.length,
    );
    if (
      targets.some((target) =>
        isWithin(
          targetPluginRoot,
          path.resolve(configDirectory, target.replace("*", wildcard)),
        ),
      )
    ) {
      return true;
    }
  }
  return false;
}

function configuredPaths(value: unknown): Record<string, string[]> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([pattern, targets]) =>
      Array.isArray(targets) &&
      targets.every((target) => typeof target === "string")
        ? [[pattern, targets as string[]]]
        : [],
    ),
  );
}

// The compiler API currently does not expose project references in its parsed
// config response. Read only that metadata with the compiler's JSONC scanner;
// source membership and module resolution remain owned by compiler Projects.
async function projectConfigs(configFile: string, seen = new Set<string>()): Promise<string[]> {
  const resolved = path.resolve(configFile);
  if (seen.has(resolved)) return [];
  seen.add(resolved);
  const scanner = createScanner(true, undefined, await readFile(resolved, "utf8"));
  const tokens: string[] = [];
  while (scanner.scan() !== SyntaxKind.EndOfFile) tokens.push(scanner.getTokenText());
  const config = JSON.parse(tokens.filter((token, index) =>
    token !== "," || !["}", "]"].includes(tokens[index + 1] ?? "")).join(" ")) as { references?: { path: string }[] };
  const configs = [resolved];
  for (const reference of config.references ?? []) {
    if (typeof reference.path !== "string") throw new Error(`Invalid project reference in ${resolved}`);
    const target = path.resolve(path.dirname(resolved), reference.path);
    configs.push(...await projectConfigs(target.endsWith(".json") ? target : path.join(target, "tsconfig.json"), seen));
  }
  return configs;
}

export async function inspectPluginSourceReferences(
  projectRoot: string,
  paths: AgentUIProjectPaths,
  pluginId: string,
  directory: string,
): Promise<PluginSourceReferenceInspection> {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const targetPluginRoot = path.join(paths.pluginsRoot, directory);
  // Plugin files are supplemental open files for projects which exclude managed
  // source from their include list. All application consumers come from the
  // compiler's Project programs, independent of sourceRoot or directory names.
  const pluginFiles = await collectFiles(paths.pluginsRoot,
    filePath => SOURCE_EXTENSIONS.includes(path.extname(filePath)));
  const configFilePath = path.join(resolvedProjectRoot, "tsconfig.json");
  const configFiles = await projectConfigs(configFilePath);
  const api = new API();
  const rootConfig = api.parseConfigFile(configFilePath);
  const snapshot = api.updateSnapshot({ openProjects: configFiles, openFiles: pluginFiles });
  const references: PluginSourceReference[] = [];
  const seen = new Set<string>();
  const add = (reference: PluginSourceReference): void => {
    const key = `${reference.path}:${reference.line}:${reference.column}:${reference.kind}:${reference.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      references.push(reference);
    }
  };

  try {
    const supplemental = new Map<Project, string[]>();
    for (const file of pluginFiles) {
      const project = snapshot.getDefaultProjectForFile(file);
      if (!project) throw new Error(`Cannot resolve Plugin source Project: ${file}`);
      supplemental.set(project, [...(supplemental.get(project) ?? []), file]);
    }
    const projects = [...new Set([...snapshot.getProjects(), ...supplemental.keys()])];
    if (projects.length === 0) throw new Error("No TypeScript Project is available for reference inspection.");
    for (const project of projects) {
      const pathMappings = configuredPaths(project.compilerOptions.paths ?? rootConfig.options.paths);
      const configDirectory = project.compilerOptions.paths === undefined ? path.dirname(configFilePath) : path.dirname(project.configFileName);
      for (const fileName of new Set([...project.program.getSourceFileNames(), ...(supplemental.get(project) ?? [])])) {
        if (!SOURCE_EXTENSIONS.includes(path.extname(fileName)) || !sourceScope(resolvedProjectRoot, targetPluginRoot, fileName)) continue;
        const sourceFile = project.program.getSourceFile(fileName);
        if (!sourceFile) throw new Error(`Cannot inspect Project source: ${fileName}`);
        const relativePath = projectPath(resolvedProjectRoot, fileName);
        const visit = (node: Node): void => {
          if (isStringLiteralLikeNode(node)) {
            const location = sourceFile.getLineAndCharacterOfPosition(
              node.getStart(),
            );
            if (node.text === pluginId) {
              add({
                path: relativePath,
                line: location.line + 1,
                column: location.character + 1,
                kind: "plugin-id-literal",
                value: node.text,
              });
            }
            if (moduleReference(node)) {
              const directPath = node.text.startsWith(".")
                ? path.resolve(path.dirname(sourceFile.fileName), node.text)
                : undefined;
              if (
                compilerResolvesInside(project, node, targetPluginRoot) ||
                compilerPathMappingInside(
                  pathMappings,
                  configDirectory,
                  node.text,
                  targetPluginRoot,
                ) ||
                (directPath !== undefined &&
                  isWithin(targetPluginRoot, directPath))
              ) {
                add({
                  path: relativePath,
                  line: location.line + 1,
                  column: location.character + 1,
                  kind: "module",
                  value: node.text,
                });
              }
            }
          }
          node.forEachChild(visit);
        };
        visit(sourceFile);
      }
    }
  } finally {
    snapshot.dispose();
    api.close();
  }

  // Styles need filesystem inspection because they are not TypeScript program
  // sources. Scope to the project, with the same dependency/output exclusions.
  const styleFiles = await collectFiles(resolvedProjectRoot,
    filePath => STYLE_EXTENSIONS.includes(path.extname(filePath)));
  for (const styleFile of new Set(styleFiles)) {
    if (!sourceScope(resolvedProjectRoot, targetPluginRoot, styleFile)) {
      continue;
    }
    const source = await readFile(styleFile, "utf8");
    const referencePattern =
      /(?:@(?:import|use|forward)\s+(?:url\(\s*)?|url\(\s*)(?:"([^"]+)"|'([^']+)'|([^\s)'";]+))/gu;
    for (const match of source.matchAll(referencePattern)) {
      const value = (match[1] ?? match[2] ?? match[3])?.split(/[?#]/u, 1)[0];
      if (value === undefined || !value.startsWith(".")) {
        continue;
      }
      const resolved = path.resolve(path.dirname(styleFile), value);
      if (!isWithin(targetPluginRoot, resolved)) {
        continue;
      }
      const matchIndex = match.index ?? 0;
      const before = source.slice(0, matchIndex);
      const lastNewline = before.lastIndexOf("\n");
      add({
        path: projectPath(resolvedProjectRoot, styleFile),
        line: before.split("\n").length,
        column: matchIndex - lastNewline,
        kind: "module",
        value,
      });
    }
  }

  const manifestPaths = await collectFiles(
    paths.pluginsRoot,
    (filePath) => path.basename(filePath) === "manifest.json",
  );
  for (const manifestPath of manifestPaths) {
    if (isWithin(targetPluginRoot, path.resolve(manifestPath))) {
      continue;
    }
    const source = await readFile(manifestPath, "utf8");
    if (jsonContainsExactString(JSON.parse(source) as unknown, pluginId)) {
      add({
        path: projectPath(resolvedProjectRoot, manifestPath),
        line: 1,
        column: 1,
        kind: "plugin-id-manifest",
        value: pluginId,
      });
    }
  }

  references.sort((left, right) =>
    left.path === right.path
      ? left.line === right.line
        ? left.column - right.column
        : left.line - right.line
      : left.path.localeCompare(right.path),
  );
  return {
    pluginId,
    directory,
    references: references.slice(0, MAX_PLUGIN_SOURCE_REFERENCES),
    truncated: references.length > MAX_PLUGIN_SOURCE_REFERENCES,
  };
}
