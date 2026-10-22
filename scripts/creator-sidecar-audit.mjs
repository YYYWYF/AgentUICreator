import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";

/** Read Python only from the platform artifact named by Creator's exact dependency. */
export function readCreatorPythonArtifact(creatorFiles, creatorManifest, platformArchive) {
  assert(![...creatorFiles.keys()].some(name => name.startsWith("package/dist/python/agent_ui_creator/")), "Creator must not carry a second Python source distribution");
  const expectedBytes = creatorFiles.get("package/dist/python-sidecar.json");
  assert(expectedBytes, "Creator's sidecar source descriptor is missing");
  const expected = JSON.parse(expectedBytes.toString());
  const read = name => execFileSync("tar", ["-xOf", platformArchive, `package/${name}`], { maxBuffer: 4 * 1024 * 1024 }).toString("utf8");
  const manifest = JSON.parse(read("package.json"));
  const descriptor = JSON.parse(read("sidecar.json"));
  assert.equal(descriptor.schemaVersion, 1);
  assert.equal(expected.schemaVersion, 1);
  assert.equal(manifest.name, descriptor.name);
  assert.equal(manifest.version, descriptor.version);
  assert.equal(creatorManifest.optionalDependencies?.[manifest.name], manifest.version, "Audit the exact platform dependency actually published by Creator");
  assert.equal(descriptor.sourceHash, expected.sourceHash, "Platform artifact does not match Creator's Agent source");
  const root = descriptor.pythonPackageRoot;
  assert(typeof root === "string" && !root.includes("\\") && !root.includes(":") && !root.split("/").some(part => ["", ".", ".."].includes(part)), "Invalid logical Agent root in sidecar artifact");
  return {
    name: manifest.name, version: manifest.version, sourceHash: descriptor.sourceHash,
    settings: read(path.posix.join(root, "agent_ui_creator/model_settings.py")),
    prompt: read(path.posix.join(root, "agent_ui_creator/domain_agent/prompt.py")),
  };
}
