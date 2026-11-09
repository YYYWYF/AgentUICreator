import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";
import { emittedModuleSpecifier, finalizeEsmImports } from "./finalize-esm-imports.mjs";

test("uses native Windows paths for lookup and POSIX ESM specifiers for output", () => {
  const files = new Set(["C:\\工程 space\\dist\\components\\view.js", "C:\\工程 space\\dist\\shared\\index.js"]);
  const options = { paths: path.win32, exists: filename => files.has(filename) };
  const importer = "C:\\工程 space\\dist\\entry.js";
  assert.equal(emittedModuleSpecifier(importer, "./components/view", options), "./components/view.js");
  assert.equal(emittedModuleSpecifier(importer, "./shared", options), "./shared/index.js");
  assert.equal(emittedModuleSpecifier(importer, "./style.css", options), "./style.css");
  assert.equal(emittedModuleSpecifier(importer, "react", options), "react");
});

test("rewrites imports and reexports without editing strings, comments or source snapshots", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "esm-output 中文 "));
  try {
    await mkdir(path.join(root, "shared"));
    await mkdir(path.join(root, "sources"));
    await writeFile(path.join(root, "view.js"), "export const view = true;\n");
    await writeFile(path.join(root, "shared/index.js"), "export default true;\n");
    const source = `'use client';\nimport { view } from './view';\nexport { default } from './shared';\nconst load = () => import('./view');\nconst example = "import('./view')";\n// export { view } from './view';\n`;
    await writeFile(path.join(root, "entry.js"), source);
    await writeFile(path.join(root, "sources/exact.js"), source);
    assert.equal(await finalizeEsmImports(root), 1);
    const result = await readFile(path.join(root, "entry.js"), "utf8");
    assert.ok(result.startsWith("'use client';"));
    assert.ok(result.includes("from './view.js'"));
    assert.ok(result.includes("from './shared/index.js'"));
    assert.ok(result.includes("() => import('./view.js')"));
    assert.ok(result.includes('const example = "import(\'./view\')"'));
    assert.ok(result.includes("// export { view } from './view';"));
    assert.equal(await readFile(path.join(root, "sources/exact.js"), "utf8"), source);
    assert.equal(await finalizeEsmImports(root), 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});
