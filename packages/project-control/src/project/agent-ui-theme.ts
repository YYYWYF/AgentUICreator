import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { API, ModifierFlags } from "typescript/unstable/sync";
import { getTokenPosOfNode } from "typescript/unstable/ast";
import { isVariableStatement, isIdentifier, isSatisfiesExpression, isAsExpression, isParenthesizedExpression, isObjectLiteralExpression, isPropertyAssignment, isStringLiteral } from "typescript/unstable/ast/is";
import { readAgentUIProjectConfig } from "./project-mode";
import { resolveAgentUIProjectPaths, projectRelativePath, projectControlConfigForPaths } from "./agent-ui-project-paths";
import { assertNoSymbolicLinkTraversal } from "./source-registry/path-policy";
import { acquireProjectControlLock } from "./project-control-lock";
import { verifyUIProject } from "../verify-ui";

export interface ThemeCatalog { current: string; options: { id: string }[] }
export interface ThemeChange { path: string; before: string; after: string }
async function inspect(root: string) {
  const project = await readAgentUIProjectConfig(root);
  const paths = resolveAgentUIProjectPaths(root, project.config);
  const relative = projectRelativePath(root, path.join(paths.agentUIAdaptersRoot, "theme/theme-config.ts"));
  await assertNoSymbolicLinkTraversal(root, relative);
  const source = await readFile(path.join(root, relative), "utf8");
  let literal: { text: string; start: number; end: number } | undefined;
  const api = new API();
  try {
    const absolute = path.join(root, relative);
    const snapshot = api.updateSnapshot({ openFiles: [absolute] });
    try {
      const file = snapshot.getDefaultProjectForFile(absolute)?.program.getSourceFile(absolute);
      if (file && file.text !== source) throw new Error("THEME_CONFIGURATION_CHANGED");
      if (!file) throw new Error("THEME_CONFIGURATION_UNSUPPORTED");
      for (const statement of file.statements) {
        if (!isVariableStatement(statement) || !(statement.modifierFlags & ModifierFlags.Export)) continue;
        for (const declaration of statement.declarationList.declarations) {
          if (!isIdentifier(declaration.name) || declaration.name.text !== "agentUIThemeConfig") continue;
          let value = declaration.initializer;
          while (value && (isSatisfiesExpression(value) || isAsExpression(value) || isParenthesizedExpression(value))) value = value.expression;
          if (!value || !isObjectLiteralExpression(value) || value.properties.some(property => !isPropertyAssignment(property))) continue;
          const properties = value.properties.filter(property => isPropertyAssignment(property) && (isIdentifier(property.name) || isStringLiteral(property.name)) && property.name.text === "theme");
          const property = properties[0];
          if (properties.length === 1 && property && isPropertyAssignment(property) && isStringLiteral(property.initializer)) {
            if (literal) throw new Error("THEME_CONFIGURATION_UNSUPPORTED");
            literal = { text: property.initializer.text, start: getTokenPosOfNode(property.initializer, file), end: property.initializer.end };
          }
        }
      }
    } finally { snapshot.dispose(); }
  } finally { api.close(); }
  if (!literal) throw new Error("THEME_CONFIGURATION_UNSUPPORTED");
  // An ESM subprocess resolves the facade from this project's installed dependencies.
  const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", "const { AGENT_UI_THEME_PRESETS } = await import('@agent-ui/react/theme'); process.stdout.write(JSON.stringify(AGENT_UI_THEME_PRESETS));"], { cwd: root, timeout: 15000, maxBuffer: 65536 });
  const presets: unknown = JSON.parse(stdout);
  if (!presets || typeof presets !== "object" || Array.isArray(presets) || !Object.hasOwn(presets, literal.text)) throw new Error("THEME_CAPABILITY_UNAVAILABLE");
  const catalog: ThemeCatalog = { current: literal.text, options: Object.keys(presets).map(id => ({ id })) };
  return { paths, relative, source, literal, catalog };
}
export async function getAvailableAgentUIThemes(root: string): Promise<ThemeCatalog> { return (await inspect(root)).catalog; }

/** ProjectControl owns planning/admission. The Host supplies the shared transaction storage. */
export async function setAgentUITheme(root: string, theme: string, commit: (change: ThemeChange) => Promise<{ runId?: string }>) {
  const release = await acquireProjectControlLock(root);
  try {
    const state = await inspect(root);
    if (!state.catalog.options.some(option => option.id === theme)) throw new Error("UNKNOWN_THEME");
    const after = state.catalog.current === theme ? state.source : state.source.slice(0, state.literal.start) + JSON.stringify(theme) + state.source.slice(state.literal.end);
    const verification = await verifyUIProject(root, projectControlConfigForPaths(state.paths));
    if (verification.status !== "passed") throw new Error("THEME_STATIC_VALIDATION_FAILED");
    // AST replacement changes only a known literal to a preset ID; project verification is read-only.
    const transaction = await commit({ path: state.relative, before: state.source, after });
    return { current: theme, changed: after !== state.source, changedPaths: after === state.source ? [] : [state.relative], validation: "passed" as const, ...transaction };
  } finally { await release(); }
}
