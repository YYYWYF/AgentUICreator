import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export async function contractManifest(root) {
  const manifest = {};
  async function visit(directory, relative = "") {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute, name);
      else {
        assert(entry.isFile(), `Contract must be a regular file: ${name}`);
        manifest[name] = createHash("sha256").update(await readFile(absolute)).digest("hex");
      }
    }
  }
  await visit(root);
  return manifest;
}

export async function assertContractParity(canonical, artifact) {
  assert.deepEqual(await contractManifest(artifact), await contractManifest(canonical), "Creator contract file sets and bytes must match the canonical source");
}
