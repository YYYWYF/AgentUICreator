import { readdir, readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { API, ModifierFlags } from "typescript/unstable/sync";
import { isExportDeclaration, isNamedExports, isFunctionDeclaration, isVariableStatement, isIdentifier } from "typescript/unstable/ast/is";
import { readAgentUIProjectConfig } from "./ui-project/project-mode";
import { resolveAgentUIProjectPaths } from "./ui-project/agent-ui-project-paths";
import { assertNoSymbolicLinkTraversal } from "./ui-project/source-registry/path-policy";

function exportsIntegration(filename: string): boolean {
  const api = new API();
  try {
    const snapshot = api.updateSnapshot({ openFiles: [filename] });
    try {
      const file = snapshot.getDefaultProjectForFile(filename)?.program.getSourceFile(filename);
      return file?.statements.some(statement => {
        if (isExportDeclaration(statement) && !statement.isTypeOnly && statement.exportClause && isNamedExports(statement.exportClause)) {
          return statement.exportClause.elements.some(element => !element.isTypeOnly && element.name.text === "ConversationIntegration");
        }
        if (!("modifierFlags" in statement) || typeof statement.modifierFlags !== "number" || !(statement.modifierFlags & ModifierFlags.Export)) return false;
        if (statement.modifierFlags & ModifierFlags.Default) return false;
        if (isFunctionDeclaration(statement)) return statement.name?.text === "ConversationIntegration";
        return isVariableStatement(statement) && statement.declarationList.declarations.some(declaration =>
          isIdentifier(declaration.name) && declaration.name.text === "ConversationIntegration");
      }) ?? false;
    } finally { snapshot.dispose(); }
  } finally { api.close(); }
}

/** Deterministic installation-time composition, with no runtime discovery. */
export async function writeGeneratedConversationIntegrationRegistry(projectRoot: string): Promise<void> {
  const project = await readAgentUIProjectConfig(projectRoot);
  const paths = resolveAgentUIProjectPaths(projectRoot, project.config);
  const sourceRoot = path.dirname(paths.pluginsRoot);
  const directory = "agent-ui/conversation/integrations";
  const output = "agent-ui/conversation/integrations.generated.tsx";
  await assertNoSymbolicLinkTraversal(sourceRoot, directory);
  const entries = await readdir(path.join(sourceRoot, directory), { withFileTypes: true }).catch(error => {
    if (error.code === "ENOENT") return []; throw error;
  });
  const modules = entries.filter(entry => entry.name.endsWith(".tsx")).map(entry => entry.name).sort();
  for (const filename of modules) {
    if (!/^[a-z][a-z0-9-]*\.tsx$/.test(filename)) throw new Error(`Invalid conversation integration module: ${filename}`);
    await assertNoSymbolicLinkTraversal(sourceRoot, `${directory}/${filename}`);
    if (!entries.find(entry => entry.name === filename)!.isFile()) throw new Error(`Integration must be a regular file: ${filename}`);
    if (!exportsIntegration(path.join(sourceRoot, directory, filename))) throw new Error(`Integration must export ConversationIntegration: ${filename}`);
  }
  const imports = modules.map((filename, index) => `import { ConversationIntegration as Integration${index} } from "./integrations/${filename.slice(0, -4)}";`);
  const content = modules.reduceRight((children, _, index) => `<Integration${index}>${children}</Integration${index}>`, "{children}");
  const source = ["// Generated from explicitly installed Agent UI resources.", 'import type { ReactNode } from "react";', ...imports, "",
    "export function GeneratedConversationIntegrations({ children }: { children: ReactNode }) {",
    `  return ${modules.length ? `(${content})` : "children"};`, "}", ""].join("\n");
  await assertNoSymbolicLinkTraversal(sourceRoot, output);
  const destination = path.join(sourceRoot, output);
  const old = await readFile(destination, "utf8").catch(error => { if (error.code === "ENOENT") return undefined; throw error; });
  if (old === source) return;
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await writeFile(temporary, source);
  await rename(temporary, destination);
}
