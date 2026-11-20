// @vitest-environment node
import path from "node:path";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { Scanner } from "@tailwindcss/oxide";
import ts from "typescript-ui-audit";
import { expect, it } from "vitest";
import { splitMediaAdapter } from "../scripts/split-media-adapters.mjs";
import { sharedStyleScanSources } from "../scripts/shared-style-sources.mjs";
import { applyProductAdaptations, applyProductLocalization, applyProductStyleOwnership, cleanProductAdapter } from "../scripts/sync-product-adapters.mjs";

const printer = ts.createPrinter({ removeComments: true });
function shape(text) {
  const parsed = ts.createSourceFile("media.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  expect(parsed.parseDiagnostics).toEqual([]);
  const declarations = new Map(), effects = [], exports = new Set();
  for (const node of parsed.statements) {
    const names = ts.isVariableStatement(node)
      ? node.declarationList.declarations.map(declaration => declaration.name.getText(parsed)) : node.name ? [node.name.text] : [];
    for (const name of names) {
      declarations.set(name, printer.printNode(ts.EmitHint.Unspecified, node, parsed).replace(/^export\s+/u, ""));
      if (node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) exports.add(name);
    }
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const item of node.exportClause.elements) exports.add(item.name.text);
    }
    if (ts.isExpressionStatement(node) && !ts.isStringLiteral(node.expression)) effects.push(printer.printNode(ts.EmitHint.Unspecified, node, parsed));
  }
  return { declarations, effects, exports };
}

it.each([
  ["image", "shared"],
  ["file", "plugins/generated-file-message"],
])("splits %s scenarios while preserving every declaration, side effect and public export", async (name, owner) => {
  const logical = `components/assistant-ui/elements/${name}.tsx`;
  const vendor = await readFile(new URL(`../src/${owner}/upstream/assistant-ui/${logical}`, import.meta.url), "utf8");
  const adapted = cleanProductAdapter(applyProductStyleOwnership(applyProductLocalization(applyProductAdaptations(vendor, logical), logical)), logical);
  const before = shape(adapted), modules = splitMediaAdapter(logical, adapted);
  const declarations = new Map(), effects = [];
  for (const module of modules) {
    const after = shape(module.source);
    for (const [key, value] of after.declarations) {
      expect(declarations.has(key), key).toBe(false);
      declarations.set(key, value);
    }
    effects.push(...after.effects);
  }
  expect(declarations).toEqual(before.declarations);
  expect(effects).toEqual(before.effects);
  expect(shape(modules[0].source).exports).toEqual(before.exports);
  const windowsLogical = path.win32.join("components", "assistant-ui", "elements", `${name}.tsx`).split(path.win32.sep).join("/");
  expect(splitMediaAdapter(windowsLogical, adapted)).toEqual(modules);
  expect(() => splitMediaAdapter(logical, adapted.replaceAll(name === "image" ? "ImageZoom" : "FilePlayer", "ChangedUpstreamPart"))).toThrow("split anchor changed");
});

it("keeps nested preview and zoom utilities in the shared base stylesheet scan", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-ui-media-styles-"));
  try {
    const directory = path.join(root, "internal", "adapters-generated", "assistant-ui", "components", "assistant-ui", "elements", "image");
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "zoom.js"), 'const className = "cursor-zoom-in fixed z-50";');
    await writeFile(path.join(directory, "preview.js"), 'const className = "aspect-video min-h-32";');
    const candidates = new Scanner({ sources: sharedStyleScanSources(root) }).scan();
    for (const utility of ["cursor-zoom-in", "fixed", "z-50", "aspect-video", "min-h-32"]) expect(candidates).toContain(utility);
    const windows = sharedStyleScanSources(path.win32.join("C:\\Agent UI 中文", "dist"));
    expect(windows.find(source => source.pattern.endsWith("/image/**/*.js"))).toMatchObject({ base: "C:\\Agent UI 中文\\dist" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
