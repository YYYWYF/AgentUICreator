import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { sidecarSourceHash } from "../packages/creator/scripts/sidecar-source.mjs";
import { verifySidecarPackage } from "../packages/creator/scripts/verify-sidecar-package.mjs";
import { parseRestoreArguments } from "./restore-creator-sidecars.mjs";
import { fileURLToPath } from "node:url";

test("restore accepts --all with the relocated default directory and either explicit argument order", () => {
  const artifacts = fileURLToPath(new URL("../packages/creator/platforms/dist/artifacts", import.meta.url));
  assert.equal(parseRestoreArguments(["--all"]).artifacts, artifacts);
  assert.equal(parseRestoreArguments(["--all"]).required.length, 5);
  assert.deepEqual(parseRestoreArguments([]).required, [`${process.platform}-${process.arch}`]);
  const native = path.resolve("构建产物 中文 with spaces");
  assert.equal(parseRestoreArguments(["--all", native]).artifacts, native);
  assert.equal(parseRestoreArguments([native, "--all"]).artifacts, native);
  assert.throws(() => parseRestoreArguments(["a", "b"]), /CREATOR_ARTIFACT_ARGUMENTS_INVALID/u);
  assert.throws(() => parseRestoreArguments(["--unknown"]));
});

test("separate Windows and POSIX jobs bind identical source despite checkout line endings", async t => {
  const root = await mkdtemp(path.join(tmpdir(), "sidecar source 中文 "));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "python/agent_ui_creator"), { recursive: true });
  await mkdir(path.join(root, "contracts/creator"), { recursive: true });
  const files = {
    "python/agent_ui_creator/server.py": "# 模型\nvalue = 1\n",
    "contracts/creator/operator.schema.json": "{\n  \"schemaVersion\": 1\n}\n",
    "python/pyproject.toml": '[project]\nname = "agent-ui-creator-core"\n',
    "python/requirements.lock": "package==1.2.3\n",
  };
  for (const [name, contents] of Object.entries(files)) await writeFile(path.join(root, name), contents);
  const unixHash = await sidecarSourceHash(root);
  for (const [name, contents] of Object.entries(files)) await writeFile(path.join(root, name), contents.replaceAll("\n", "\r\n"));
  assert.equal(await sidecarSourceHash(root), unixHash);
  await writeFile(path.join(root, "python/requirements.lock"), "package==2.0.0\n");
  assert.notEqual(await sidecarSourceHash(root), unixHash);
});

test("prepack refuses an empty platform package", async t => {
  const root = await mkdtemp(path.join(tmpdir(), "sidecar incomplete "));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "package.json"), '{"name":"platform","version":"1.0.0"}');
  await assert.rejects(verifySidecarPackage(root, { checkSource: false }), { code: "ENOENT" });
});
