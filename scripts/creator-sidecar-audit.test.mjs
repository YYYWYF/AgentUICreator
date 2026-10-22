import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { readCreatorPythonArtifact } from "./creator-sidecar-audit.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "sidecar audit 中文 "));
  t.after(() => rm(root, { recursive: true, force: true }));
  const name = "@za38.03/agent-ui-creator-win32-x64";
  const version = "1.2.3", sourceHash = "reviewed-source";
  const folder = path.join(root, "package");
  const agentRoot = path.join(folder, "dist/agent/agent_ui_creator");
  await mkdir(path.join(agentRoot, "domain_agent"), { recursive: true });
  await writeFile(path.join(folder, "package.json"), JSON.stringify({ name, version }));
  await writeFile(path.join(folder, "sidecar.json"), JSON.stringify({ schemaVersion: 1, name, version, sourceHash, pythonPackageRoot: "dist/agent" }));
  await writeFile(path.join(agentRoot, "model_settings.py"), "max_tokens: int = 8192\n");
  await writeFile(path.join(agentRoot, "domain_agent/prompt.py"), "application props/children/composition\n");
  const archive = path.join(root, "sidecar.tgz");
  execFileSync("tar", ["-czf", archive, "-C", root, "package"]);
  const files = new Map([["package/dist/python-sidecar.json", Buffer.from(JSON.stringify({ schemaVersion: 1, sourceHash }))]]);
  return { archive, files, manifest: { optionalDependencies: { [name]: version } }, name };
}

test("payload audit reads Agent code from the exact sidecar tarball with native Unicode paths", async t => {
  const f = await fixture(t);
  const result = readCreatorPythonArtifact(f.files, f.manifest, f.archive);
  assert(result.settings.includes("8192"));
  assert(result.prompt.includes("application props/children/composition"));
  assert.equal(result.name, f.name);
});

test("payload audit rejects a stale source hash or a different dependency version", async t => {
  const f = await fixture(t);
  assert.throws(() => readCreatorPythonArtifact(f.files, { optionalDependencies: { [f.name]: "2.0.0" } }, f.archive), /exact platform dependency/u);
  f.files.set("package/dist/python-sidecar.json", Buffer.from('{"schemaVersion":1,"sourceHash":"different"}'));
  assert.throws(() => readCreatorPythonArtifact(f.files, f.manifest, f.archive), /does not match Creator/u);
});

test("payload audit rejects a duplicate legacy Python source distribution in Creator", async t => {
  const f = await fixture(t);
  f.files.set("package/dist/python/agent_ui_creator/model_settings.py", Buffer.from("obsolete"));
  assert.throws(() => readCreatorPythonArtifact(f.files, f.manifest, f.archive), /second Python source distribution/u);
});
