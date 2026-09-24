import path from "node:path";

import { SyntaxKind, type Expression, type Node, type SourceFile } from "typescript/unstable/ast";
import {
  isArrayLiteralExpression,
  isAsExpression,
  isCallExpression,
  isExportAssignment,
  isIdentifier,
  isImportDeclaration,
  isNamedImports,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPropertyAssignment,
  isSatisfiesExpression,
  isSpreadAssignment,
  isStringLiteral,
  isVariableDeclaration,
} from "typescript/unstable/ast/is";
import { API, SymbolFlags, type Project } from "typescript/unstable/sync";

import { isValidDataMessageUIName } from "../../framework/contracts/data-message-ui";
import type { PluginAsset, ProjectIssue } from "./types";

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

function unwrap(expression: Expression): Expression {
  if (isParenthesizedExpression(expression) || isAsExpression(expression) ||
      isSatisfiesExpression(expression)) return unwrap(expression.expression);
  return expression;
}

function resolveExpression(
  project: Project,
  expression: Expression,
  seen: Set<number>,
): Expression | undefined {
  const value = unwrap(expression);
  if (!isIdentifier(value)) return value;
  const symbol = project.checker.getSymbolAtLocation(value);
  if (symbol === undefined) return undefined;
  const resolved = (symbol.flags & SymbolFlags.Alias) === 0
    ? symbol
    : project.checker.getAliasedSymbol(symbol);
  if (seen.has(resolved.id)) return undefined;
  seen.add(resolved.id);
  for (const handle of resolved.declarations) {
    const declaration = handle.resolve(project);
    if (declaration !== undefined && isVariableDeclaration(declaration) &&
        declaration.initializer !== undefined) {
      return resolveExpression(project, declaration.initializer, seen);
    }
  }
  return undefined;
}

function property(object: Node, name: string): Expression | undefined {
  if (!isObjectLiteralExpression(object)) return undefined;
  const member = object.properties.find((candidate) =>
    isPropertyAssignment(candidate) &&
    (isIdentifier(candidate.name) || isStringLiteral(candidate.name)) &&
    candidate.name.text === name,
  );
  return member !== undefined && isPropertyAssignment(member)
    ? member.initializer
    : undefined;
}

function definitionRenderers(
  project: Project,
  sourceFile: SourceFile,
): { status: "missing" | "unresolved" | "found"; expression?: Expression } {
  const assignment = sourceFile.statements.find((statement) =>
    isExportAssignment(statement) && !statement.isExportEquals,
  );
  if (assignment === undefined || !isExportAssignment(assignment)) {
    return { status: "unresolved" };
  }
  const definition = resolveExpression(project, assignment.expression, new Set());
  if (definition === undefined || !isObjectLiteralExpression(definition)) {
    return { status: "unresolved" };
  }
  const member = definition.properties.find((candidate) =>
    "name" in candidate &&
    (isIdentifier(candidate.name) || isStringLiteral(candidate.name)) &&
    candidate.name.text === "dataMessageUIs",
  );
  if (member === undefined) {
    return definition.properties.some(isSpreadAssignment)
      ? { status: "unresolved" }
      : { status: "missing" };
  }
  return isPropertyAssignment(member)
    ? { status: "found", expression: member.initializer }
    : { status: "unresolved" };
}

function issueAt(
  projectRoot: string,
  node: Node,
  asset: PluginAsset,
  code: string,
  message: string,
): ProjectIssue {
  const sourceFile = node.getSourceFile();
  const location = sourceFile.getLineAndCharacterOfPosition(node.getStart());
  const file = path.relative(projectRoot, sourceFile.fileName).split(path.sep).join("/");
  return {
    code,
    pluginId: asset.pluginId,
    message: `${file}:${location.line + 1}:${location.character + 1}: ${message}`,
  };
}

function inspectRenderer(
  projectRoot: string,
  project: Project,
  expression: Expression,
  asset: PluginAsset,
  names: string[],
  issues: ProjectIssue[],
): void {
  const renderer = resolveExpression(project, expression, new Set());
  if (renderer === undefined || !isCallExpression(renderer) ||
      !isIdentifier(renderer.expression) ||
      !publicAPIBindings(renderer.getSourceFile()).has(renderer.expression.text)) {
    issues.push(issueAt(projectRoot, expression, asset,
      "DATA_MESSAGE_UI_DEFINITION_NOT_STATIC",
      `Plugin "${asset.pluginId}" dataMessageUIs entry must resolve to defineDataMessageUI from @agent-ui/react.`,
    ));
    return;
  }
  const nameNode = renderer.arguments[0] === undefined
    ? undefined
    : property(renderer.arguments[0], "name");
  if (nameNode === undefined || !isStringLiteral(nameNode)) {
    issues.push(issueAt(projectRoot, renderer, asset,
      "DATA_MESSAGE_UI_NAME_NOT_STATIC",
      `Plugin "${asset.pluginId}" Data Message UI name must be a static string literal.`,
    ));
  } else if (!isValidDataMessageUIName(nameNode.text)) {
    issues.push(issueAt(projectRoot, renderer, asset,
      "DATA_MESSAGE_UI_INVALID_NAME",
      `Data Message UI name ${JSON.stringify(nameNode.text)} in plugin "${asset.pluginId}" must be nonempty and trimmed.`,
    ));
  } else {
    names.push(nameNode.text);
  }
}

/** Read the default-exported Plugin definition as facts; never execute Plugin modules. */
export async function analyzeDataMessageUIs(
  projectRoot: string,
  assets: readonly PluginAsset[],
): Promise<ProjectIssue[]> {
  const issues: ProjectIssue[] = [];
  const api = new API();
  try {
    const snapshot = api.updateSnapshot({
      openFiles: assets.map((asset) => path.join(projectRoot, asset.definitionPath)),
    });
    try {
      for (const asset of assets) {
        const definitionPath = path.join(projectRoot, asset.definitionPath);
        const project = snapshot.getDefaultProjectForFile(definitionPath);
        const sourceFile = project?.program.getSourceFile(definitionPath);
        if (project === undefined || sourceFile === undefined) continue;
        const declaration = definitionRenderers(project, sourceFile);
        const names: string[] = [];
        let rendererCount = 0;
        let registrationsStatic = true;
        if (declaration.status === "unresolved") {
          registrationsStatic = false;
          issues.push(issueAt(projectRoot, sourceFile, asset,
            "DATA_MESSAGE_UI_DEFINITION_NOT_STATIC",
            `Plugin "${asset.pluginId}" default definition must be a static object with a readable dataMessageUIs property.`,
          ));
        } else if (declaration.status === "found" && declaration.expression !== undefined) {
          const renderers = resolveExpression(project, declaration.expression, new Set());
          if (renderers === undefined || !isArrayLiteralExpression(renderers)) {
            registrationsStatic = false;
            issues.push(issueAt(projectRoot, declaration.expression, asset,
              "DATA_MESSAGE_UI_DEFINITION_NOT_STATIC",
              `Plugin "${asset.pluginId}" dataMessageUIs must be a static array.`,
            ));
          } else {
            rendererCount = renderers.elements.length;
            for (const element of renderers.elements) {
              inspectRenderer(projectRoot, project, element, asset, names, issues);
            }
          }
        }
        asset.dataMessageUINames = names;
        if (asset.manifest.data?.messageUI === true && rendererCount === 0 &&
            registrationsStatic) {
          issues.push({
            code: "DATA_MESSAGE_UI_RENDERER_MISSING",
            pluginId: asset.pluginId,
            message: `Plugin "${asset.pluginId}" declares data.messageUI but its definition has no dataMessageUIs renderer.`,
          });
        } else if (asset.manifest.data?.messageUI !== true && rendererCount > 0) {
          issues.push({
            code: "DATA_MESSAGE_UI_MANIFEST_MISSING",
            pluginId: asset.pluginId,
            message: `Plugin "${asset.pluginId}" registers a Data Message UI renderer but does not declare data.messageUI in its manifest.`,
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
