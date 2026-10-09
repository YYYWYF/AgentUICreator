import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
test("a cached build detects replacement before any project validation or installation", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "control-integrity-"));
  try {
    await mkdir(path.join(root, "src"));
    await mkdir(path.join(root, "dist/runtime"), { recursive: true });
    await copyFile(new URL("../src/runtime-integrity.mjs", import.meta.url), path.join(root, "src/runtime-integrity.mjs"));
    const { assertRuntimeBuildCurrent } = await import(pathToFileURL(path.join(root, "src/runtime-integrity.mjs")).href);
    const manifest = path.join(root, "dist/runtime/build.json");
    await writeFile(manifest, JSON.stringify({ buildId: "loaded-build", inputs: {} }));
    assert.doesNotThrow(() => assertRuntimeBuildCurrent("loaded-build"));
    await writeFile(manifest, JSON.stringify({ buildId: "new-build", inputs: {} }));
    assert.throws(() => assertRuntimeBuildCurrent("loaded-build"), { code: "CREATOR_PROJECT_CONTROL_RESTART_REQUIRED" });
    assert.doesNotThrow(() => assertRuntimeBuildCurrent("new-build"));
    await rm(manifest);
    assert.throws(() => assertRuntimeBuildCurrent("new-build"), { code: "CREATOR_PROJECT_CONTROL_RESTART_REQUIRED" });
  } finally { await rm(root, { recursive: true, force: true }); }
});
