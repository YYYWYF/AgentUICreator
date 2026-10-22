import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { preparationState } from "./preparation-state.mjs";
test("preparation receipt follows source and output changes; legacy flags cannot skip", () => {
  const before = preparationState(["creator"]);
  assert.notEqual(before, "1");
  const file = new URL("../packages/operator/control/dist/preparation-test.txt", import.meta.url);
  try {
    writeFileSync(file, "stale");
    const stale = preparationState(["creator"]);
    assert.notEqual(stale, before);
    writeFileSync(file, "rebuilt");
    assert.notEqual(preparationState(["creator"]), stale);
  } finally { unlinkSync(file); }
  assert.equal(preparationState(["creator"]), before);
});

test("Creator preparation follows nested Python sources and ignores Python environment caches", () => {
  const pythonRoot = fileURLToPath(new URL("../packages/creator/python/", import.meta.url));
  const before = preparationState(["creator"]);
  const temporary = mkdtempSync(path.join(pythonRoot, "preparation-test-"));
  try {
    writeFileSync(path.join(temporary, "source.py"), "value = 1\n");
    const sourceChanged = preparationState(["creator"]);
    assert.notEqual(sourceChanged, before);
    for (const name of [".venv", "__pycache__", ".pytest_cache"]) {
      mkdirSync(path.join(temporary, name));
      writeFileSync(path.join(temporary, name, "cache"), "ignored");
    }
    assert.equal(preparationState(["creator"]), sourceChanged);
    writeFileSync(path.join(temporary, "source.py"), "value = 2\n");
    assert.notEqual(preparationState(["creator"]), sourceChanged);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
  assert.equal(preparationState(["creator"]), before);
});

import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";

test("temporary Plugin resource views do not invalidate prepared packages; owner and output changes do", async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "agent ui types 工程 "));
  try {
    const root = path.join(workspaceRoot, "packages/plugins");
    await mkdir(path.join(root, "src/plugins"), { recursive: true });
    await mkdir(path.join(root, "resources"), { recursive: true });
    await mkdir(path.join(root, "dist"), { recursive: true });
    const view = "resources/registry/items/plugin/sample/files/plugins/sample/index.tsx";
    await writeFile(path.join(root, "source-layout.json"), JSON.stringify({ files: [{ source: "src/plugins/owner.tsx", view }] }));
    await writeFile(path.join(root, "package.json"), '{"name":"fixture","version":"1.0.0"}');
    await writeFile(path.join(workspaceRoot, "pnpm-lock.yaml"), "lockfileVersion: '6.0'\n");
    await writeFile(path.join(root, "src/plugins/owner.tsx"), "export const value = 1;\n");
    await writeFile(path.join(root, "dist/index.js"), "export const value = 1;\n");
    const state = () => preparationState(["plugins"], { workspaceRoot });
    const before = state();
    await mkdir(path.dirname(path.join(root, ...view.split("/"))), { recursive: true });
    await writeFile(path.join(root, ...view.split("/")), "export const value = 1;\n");
    assert.equal(state(), before);
    await rm(path.join(root, "resources/registry"), { recursive: true });
    assert.equal(state(), before);
    await writeFile(path.join(root, "src/plugins/owner.tsx"), "export const value = 2;\n");
    assert.notEqual(state(), before);
    const ownerChanged = state();
    await writeFile(path.join(root, "dist/index.js"), "export const value = 2;\n");
    assert.notEqual(state(), ownerChanged);
  } finally { await rm(workspaceRoot, { recursive: true, force: true }); }
});
