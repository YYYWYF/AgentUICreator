import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript-ui-audit";

/** ESM specifiers are logical POSIX paths; only disk access uses native paths. */
export function emittedModuleSpecifier(importer, specifier, { paths = path, exists = existsSync } = {}) {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return specifier;
  if ([".js", ".mjs", ".cjs", ".json", ".css"].includes(path.posix.extname(specifier))) return specifier;
  const target = paths.resolve(paths.dirname(importer), ...specifier.split("/"));
  if (exists(`${target}.js`)) return `${specifier}.js`;
  if (exists(paths.join(target, "index.js"))) return `${specifier.replace(/\/$/u, "")}/index.js`;
  return specifier;
}

/** Rewrite emitted references, leaving source owners and exact tooling snapshots intact. */
export async function finalizeEsmImports(distRoot) {
  let changed = 0;
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (directory === distRoot && ["sources", "resources"].includes(entry.name)) continue;
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) { await visit(filename); continue; }
      if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
      let source = await readFile(filename, "utf8");
      const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      const replacements = [];
      function scan(node) {
        const literal = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ? node.moduleSpecifier
          : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : undefined;
        if (literal && ts.isStringLiteral(literal)) {
          const specifier = emittedModuleSpecifier(filename, literal.text);
          if (specifier !== literal.text) replacements.push({ start: literal.getStart(file) + 1, end: literal.getEnd() - 1, specifier });
        }
        ts.forEachChild(node, scan);
      }
      scan(file);
      for (const { start, end, specifier } of replacements.sort((left, right) => right.start - left.start)) {
        source = source.slice(0, start) + specifier + source.slice(end);
      }
      if (replacements.length) { await writeFile(filename, source); changed++; }
    }
  }
  await visit(distRoot);
  return changed;
}
