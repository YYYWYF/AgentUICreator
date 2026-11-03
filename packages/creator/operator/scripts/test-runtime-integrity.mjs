import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
test("a cached build detects replacement before any project validation or installation", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "control-integrity-"));
  try {
    await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "@za38.03/agent-ui-creator", version: "0.0.1" }));
    await mkdir(path.join(root, "src"));
    await mkdir(path.join(root, "dist/runtime"), { recursive: true });
    await copyFile(new URL("../src/runtime-integrity.mjs", import.meta.url), path.join(root, "src/runtime-integrity.mjs"));
    const { assertRuntimeBuildCurrent } = await import(pathToFileURL(path.join(root, "src/runtime-integrity.mjs")).href);
    const manifest = path.join(root, "dist/runtime/build.json");
    await writeFile(manifest, JSON.stringify({ buildId: "loaded-build", inputs: {} }));
    assert.doesNotThrow(() => assertRuntimeBuildCurrent("loaded-build"));
    await writeFile(manifest, JSON.stringify({ buildId: "new-build", inputs: {} }));
    assert.throws(() => assertRuntimeBuildCurrent("loaded-build"), { code: "CREATOR_OPERATOR_RESTART_REQUIRED" });
    assert.doesNotThrow(() => assertRuntimeBuildCurrent("new-build"));
    await rm(manifest);
    assert.throws(() => assertRuntimeBuildCurrent("new-build"), { code: "CREATOR_OPERATOR_RESTART_REQUIRED" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

for (const layout of ["operator", "dist/operator"]) {
  test(`Creator ${layout} detects source drift through its actual package root`, async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "Creator 合包 integrity "));
    try {
      const creator = path.join(workspace, "packages", "creator");
      const module = path.join(creator, ...layout.split("/"));
      await mkdir(path.join(module, "src"), { recursive: true });
      await mkdir(path.join(module, "dist", "runtime"), { recursive: true });
      await mkdir(path.join(workspace, "scripts"));
      await writeFile(path.join(workspace, "scripts", "prepare-workbench.mjs"), "// workspace marker\n");
      await writeFile(path.join(creator, "package.json"), JSON.stringify({ name: "@za38.03/agent-ui-creator", version: "0.0.1" }));
      const logical = "packages/creator/operator-input.ts";
      const input = "export const value = 1;\n";
      await writeFile(path.join(workspace, ...logical.split("/")), input);
      await copyFile(new URL("../src/runtime-integrity.mjs", import.meta.url), path.join(module, "src", "runtime-integrity.mjs"));
      const manifest = path.join(module, "dist", "runtime", "build.json");
      await writeFile(manifest, JSON.stringify({ buildId: "current", inputs: { [logical]: createHash("sha256").update(input).digest("hex") } }));
      const { assertRuntimeBuildCurrent } = await import(pathToFileURL(path.join(module, "src", "runtime-integrity.mjs")).href);
      assert.doesNotThrow(() => assertRuntimeBuildCurrent("current"));
      await writeFile(path.join(workspace, ...logical.split("/")), "// changed source\n");
      assert.throws(() => assertRuntimeBuildCurrent("current"), { code: "CREATOR_OPERATOR_RESTART_REQUIRED" });
      await writeFile(path.join(workspace, ...logical.split("/")), input);
      assert.doesNotThrow(() => assertRuntimeBuildCurrent("current"));
      await writeFile(manifest, JSON.stringify({ buildId: "replaced", inputs: {} }));
      assert.throws(() => assertRuntimeBuildCurrent("current"), { code: "CREATOR_OPERATOR_RESTART_REQUIRED" });
    } finally { await rm(workspace, { recursive: true, force: true }); }
  });
}
