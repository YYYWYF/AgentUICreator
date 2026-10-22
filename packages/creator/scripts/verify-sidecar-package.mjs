import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sidecarSourceHash } from "./sidecar-source.mjs";

export const sidecarPlatforms = ["win32-x64", "linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64"];
const creatorRoot = fileURLToPath(new URL("../", import.meta.url));
export const sidecarRoot = id => path.resolve(creatorRoot, "platforms", id);

export async function verifySidecarPackage(root, { checkSource = true } = {}) {
  const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const descriptor = JSON.parse(await readFile(path.join(root, "sidecar.json"), "utf8"));
  assert.equal(descriptor.schemaVersion, 1);
  assert.equal(descriptor.name, manifest.name);
  assert.equal(descriptor.version, manifest.version);
  assert.deepEqual(manifest.os, [descriptor.platform]);
  assert.deepEqual(manifest.cpu, [descriptor.arch]);
  if (checkSource) assert.equal(descriptor.sourceHash, await sidecarSourceHash(creatorRoot), "Rebuild sidecar: Agent/lock/contracts source changed");
  for (const logical of [descriptor.executable, descriptor.pythonPackageRoot]) {
    assert.equal(typeof logical, "string");
    assert(!logical.includes("\\") && !logical.includes(":") && !logical.split("/").some(part => ["", ".", ".."].includes(part)));
    await access(path.join(root, ...logical.split("/")));
  }
  const files = {};
  async function visit(directory, prefix = "dist") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const logical = `${prefix}/${entry.name}`;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(file, logical);
      else {
        assert(entry.isFile(), `npm sidecar must contain regular files, not symlinks: ${logical}`);
        files[logical] = createHash("sha256").update(await readFile(file)).digest("hex");
      }
    }
  }
  await visit(path.join(root, "dist"));
  assert(descriptor.files && typeof descriptor.files === "object", "Sidecar file inventory is missing");
  const changed = [...new Set([...Object.keys(files), ...Object.keys(descriptor.files)])]
    .filter(name => files[name] !== descriptor.files[name]);
  assert.equal(changed.length, 0, `Sidecar contents differ from the built inventory: ${changed.slice(0, 5).join(", ")}`);
  return descriptor;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await verifySidecarPackage(path.resolve(process.argv[2] ?? "."));
}
