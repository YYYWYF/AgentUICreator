import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { preparationState } from "./preparation-state.mjs";
test("preparation receipt follows source and output changes; legacy flags cannot skip", () => {
  const before = preparationState(["operator"]);
  assert.notEqual(before, "1");
  const file = new URL("../packages/operator/dist/preparation-test.txt", import.meta.url);
  try {
    writeFileSync(file, "stale");
    const stale = preparationState(["operator"]);
    assert.notEqual(stale, before);
    writeFileSync(file, "rebuilt");
    assert.notEqual(preparationState(["operator"]), stale);
  } finally { unlinkSync(file); }
  assert.equal(preparationState(["operator"]), before);
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
