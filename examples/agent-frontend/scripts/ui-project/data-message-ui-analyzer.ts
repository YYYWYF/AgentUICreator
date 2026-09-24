import { readdir } from "node:fs/promises";
import path from "node:path";

import { SyntaxKind, type Node, type SourceFile } from "typescript/unstable/ast";
import {
  isCallExpression,
  isIdentifier,
  isImportDeclaration,
  isNamedImports,
  isObjectLiteralExpression,
  isPropertyAssignment,
  isStringLiteral,
} from "typescript/unstable/ast/is";
import { API } from "typescript/unstable/sync";

import { isValidDataMessageUIName } from "../../framework/contracts/data-message-ui";
import type { PluginAsset, ProjectIssue } from "./types";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx"]);
const EXCLUDED_DIRECTORIES = new Set(["__tests__", "dist", "node_modules"]);
const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:[cm]?ts|tsx|js|jsx)$/u;

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory() && !EXCLUDED_DIRECTORIES.has(entry.name)) {
      files.push(...(await sourceFiles(entryPath)));
    } else if (
      entry.isFile() &&
      SOURCE_EXTENSIONS.has(path.extname(entry.name)) &&
      !TEST_FILE_PATTERN.test(entry.name)
    ) {
      files.push(entryPath);
    }
  }
  return files;
}

function publicAPIBindings(sourceFile: SourceFile): ReadonlySet<string> {
  const bindings = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!isImportDeclaration(statement) ||
        !isStringLiteral(statement.moduleSpecifier) ||
        statement.moduleSpecifier.text !== "@agent-ui/react") continue;
    const clause = statement.importClause;
    if (clause === undefined || clause.phaseModifier === SyntaxKind.TypeKeyword ||
        clause.namedBindings === undefined || !isNamedImports(clause.namedBindings)) continue;
    for (const element of clause.namedBindings.elements) {
      if (!element.isTypeOnly &&
          (element.propertyName?.text ?? element.name.text) === "defineDataMessageUI") {
        bindings.add(element.name.text);
      }
    }
  }
  return bindings;
}

function inspectSource(
  projectRoot: string,
  sourceFile: SourceFile,
  asset: PluginAsset,
  names: string[],
  issues: ProjectIssue[],
): number {
  const bindings = publicAPIBindings(sourceFile);
  if (bindings.size === 0) return 0;
  const relativePath = path.relative(projectRoot, sourceFile.fileName).split(path.sep).join("/");
  let count = 0;
  const visit = (node: Node): void => {
    if (isCallExpression(node) && isIdentifier(node.expression) &&
        bindings.has(node.expression.text)) {
      count += 1;
      const argument = node.arguments[0];
      const nameProperty = argument !== undefined && isObjectLiteralExpression(argument)
        ? argument.properties.find((property) =>
            isPropertyAssignment(property) &&
            (isIdentifier(property.name) || isStringLiteral(property.name)) &&
            property.name.text === "name",
          )
        : undefined;
      const nameNode = nameProperty !== undefined && isPropertyAssignment(nameProperty)
        ? nameProperty.initializer
        : undefined;
      const location = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      const at = `${relativePath}:${location.line + 1}:${location.character + 1}`;
      if (nameNode === undefined || !isStringLiteral(nameNode)) {
        issues.push({
          code: "DATA_MESSAGE_UI_NAME_NOT_STATIC",
          pluginId: asset.pluginId,
          message: `${at}: Plugin "${asset.pluginId}" Data Message UI name must be a static string literal.`,
        });
      } else if (!isValidDataMessageUIName(nameNode.text)) {
        issues.push({
          code: "DATA_MESSAGE_UI_INVALID_NAME",
          pluginId: asset.pluginId,
          message: `${at}: Data Message UI name ${JSON.stringify(nameNode.text)} in plugin "${asset.pluginId}" must be nonempty and trimmed.`,
        });
      } else {
        names.push(nameNode.text);
      }
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return count;
}

/** Read Plugin source as facts; never execute Plugin modules. */
export async function analyzeDataMessageUIs(
  projectRoot: string,
  assets: readonly PluginAsset[],
): Promise<ProjectIssue[]> {
  const filesByAsset = await Promise.all(assets.map(async (asset) => ({
    asset,
    files: await sourceFiles(path.join(projectRoot, path.dirname(asset.manifestPath))),
  })));
  const allFiles = filesByAsset.flatMap(({ files }) => files);
  const issues: ProjectIssue[] = [];
  const api = new API();
  try {
    const snapshot = api.updateSnapshot({ openFiles: allFiles });
    try {
      for (const { asset, files } of filesByAsset) {
        const names: string[] = [];
        let rendererCount = 0;
        for (const filePath of files) {
          const project = snapshot.getDefaultProjectForFile(filePath);
          const sourceFile = project?.program.getSourceFile(filePath);
          if (sourceFile !== undefined) {
            rendererCount += inspectSource(projectRoot, sourceFile, asset, names, issues);
          }
        }
        asset.dataMessageUINames = names;
        if (asset.manifest.data?.messageUI === true && rendererCount === 0) {
          issues.push({
            code: "DATA_MESSAGE_UI_RENDERER_MISSING",
            pluginId: asset.pluginId,
            message: `Plugin "${asset.pluginId}" declares data.messageUI but has no defineDataMessageUI renderer from @agent-ui/react.`,
          });
        } else if (asset.manifest.data?.messageUI !== true && rendererCount > 0) {
          issues.push({
            code: "DATA_MESSAGE_UI_MANIFEST_MISSING",
            pluginId: asset.pluginId,
            message: `Plugin "${asset.pluginId}" defines a Data Message UI renderer but does not declare data.messageUI in its manifest.`,
          });
        }
      }
    } finally {
      snapshot.dispose();
    }
  } finally {
    api.close();
  }
  return issues;
}
