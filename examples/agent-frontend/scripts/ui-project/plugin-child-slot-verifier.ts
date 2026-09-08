import { readdir } from "node:fs/promises";
import path from "node:path";

import type { Node, SourceFile } from "typescript/unstable/ast";
import {
  isCallExpression,
  isIdentifier,
  isPropertyAccessExpression,
  isStringLiteral,
} from "typescript/unstable/ast/is";
import { API } from "typescript/unstable/sync";

import type { PluginAsset, ProjectIssue } from "./types";

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
]);
const EXCLUDED_DIRECTORIES = new Set(["__tests__", "dist", "node_modules"]);
const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:[cm]?ts|tsx|js|jsx)$/u;

export interface RenderedChildSlot {
  slotId: string;
  path: string;
  line: number;
  column: number;
}

interface DynamicRenderedChildSlot {
  path: string;
  line: number;
  column: number;
}

function projectPath(projectRoot: string, filePath: string): string {
  return path.relative(projectRoot, filePath).split(path.sep).join("/");
}

async function collectPluginSourceFiles(
  directoryPath: string,
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
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
        files.push(
          ...(await collectPluginSourceFiles(
            path.join(directoryPath, entry.name),
          )),
        );
      }
      continue;
    }
    if (
      entry.isFile() &&
      SOURCE_EXTENSIONS.has(path.extname(entry.name)) &&
      !TEST_FILE_PATTERN.test(entry.name)
    ) {
      files.push(path.join(directoryPath, entry.name));
    }
  }
  return files;
}

function isRenderSlotCall(node: Node): boolean {
  if (!isCallExpression(node)) {
    return false;
  }
  if (isIdentifier(node.expression)) {
    return node.expression.text === "renderSlot";
  }
  return (
    isPropertyAccessExpression(node.expression) &&
    isIdentifier(node.expression.name) &&
    node.expression.name.text === "renderSlot"
  );
}

function sourceLocation(sourceFile: SourceFile, node: Node): {
  line: number;
  column: number;
} {
  const location = sourceFile.getLineAndCharacterOfPosition(node.getStart());
  return { line: location.line + 1, column: location.character + 1 };
}

function inspectRenderedChildSlots(
  projectRoot: string,
  sourceFile: SourceFile,
): {
  rendered: RenderedChildSlot[];
  dynamic: DynamicRenderedChildSlot[];
} {
  const rendered: RenderedChildSlot[] = [];
  const dynamic: DynamicRenderedChildSlot[] = [];
  const relativePath = projectPath(projectRoot, sourceFile.fileName);
  const visit = (node: Node): void => {
    if (isCallExpression(node) && isRenderSlotCall(node)) {
      const argument = node.arguments[0];
      const location = sourceLocation(sourceFile, node);
      if (argument !== undefined && isStringLiteral(argument)) {
        rendered.push({
          slotId: argument.text,
          path: relativePath,
          ...location,
        });
      } else {
        dynamic.push({ path: relativePath, ...location });
      }
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return { rendered, dynamic };
}

export async function verifyPluginChildSlots(
  projectRoot: string,
  assets: readonly PluginAsset[],
): Promise<ProjectIssue[]> {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const sourcesByPlugin = await Promise.all(
    assets.map(async (asset) => ({
      asset,
      files: await collectPluginSourceFiles(
        path.join(resolvedProjectRoot, "plugins", asset.directory),
      ),
    })),
  );
  const sourceFiles = sourcesByPlugin.flatMap(({ files }) => files);
  const inspections = new Map<
    PluginAsset,
    { rendered: RenderedChildSlot[]; dynamic: DynamicRenderedChildSlot[] }
  >();

  if (sourceFiles.length > 0) {
    const api = new API();
    try {
      const snapshot = api.updateSnapshot({ openFiles: sourceFiles });
      try {
        for (const { asset, files } of sourcesByPlugin) {
          const rendered: RenderedChildSlot[] = [];
          const dynamic: DynamicRenderedChildSlot[] = [];
          for (const filePath of files) {
            const project = snapshot.getDefaultProjectForFile(filePath);
            const sourceFile = project?.program.getSourceFile(filePath);
            if (sourceFile === undefined) {
              continue;
            }
            const result = inspectRenderedChildSlots(
              resolvedProjectRoot,
              sourceFile,
            );
            rendered.push(...result.rendered);
            dynamic.push(...result.dynamic);
          }
          inspections.set(asset, { rendered, dynamic });
        }
      } finally {
        snapshot.dispose();
      }
    } finally {
      api.close();
    }
  }

  const issues: ProjectIssue[] = [];
  for (const asset of assets) {
    const inspection = inspections.get(asset) ?? {
      rendered: [],
      dynamic: [],
    };
    for (const location of inspection.dynamic) {
      issues.push({
        code: "plugin-child-slot-dynamic-render-unsupported",
        message: `${location.path}:${location.line}:${location.column}: Plugin "${asset.pluginId}" renders a child Slot using a dynamic identifier. Child Slot ids must use static string literals so the Plugin Manifest can be verified deterministically.`,
      });
    }

    const declared = new Set(asset.childSlots ?? []);
    const rendered = new Set(inspection.rendered.map(({ slotId }) => slotId));
    for (const slotId of [...declared]
      .filter((id) => !rendered.has(id))
      .sort()) {
      issues.push({
        code: "plugin-child-slot-declared-not-rendered",
        message: `Plugin "${asset.pluginId}" declares child Slot "${slotId}" in ${asset.manifestPath}, but no runtime source calls renderSlot("${slotId}").`,
      });
    }
    for (const slotId of [...rendered]
      .filter((id) => !declared.has(id))
      .sort()) {
      const location = inspection.rendered.find(
        (item) => item.slotId === slotId,
      )!;
      issues.push({
        code: "plugin-child-slot-rendered-not-declared",
        message: `${location.path}:${location.line}:${location.column}: Plugin "${asset.pluginId}" renders child Slot "${slotId}", but ${asset.manifestPath} does not declare it in slots.children.`,
      });
    }
  }
  return issues;
}
