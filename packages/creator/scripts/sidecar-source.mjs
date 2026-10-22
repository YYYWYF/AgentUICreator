import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

// Normalize text line endings so separate Windows/POSIX build jobs bind the same source.
export async function sidecarSourceHash(creatorRoot) {
  const records = [];
  async function visit(directory, prefix, pythonOnly = false) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === "__pycache__") continue;
      const name = `${prefix}/${entry.name}`;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(file, name, pythonOnly);
      else if (entry.isFile() && (!pythonOnly || name.endsWith(".py"))) records.push([name, file]);
    }
  }
  await visit(path.join(creatorRoot, "python/agent_ui_creator"), "agent_ui_creator", true);
  await visit(path.join(creatorRoot, "contracts/creator"), "_contracts/creator");
  for (const name of ["pyproject.toml", "requirements.lock"]) records.push([name, path.join(creatorRoot, "python", name)]);
  const digest = createHash("sha256");
  for (const [name, file] of records.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    const bytes = (await readFile(file, "utf8")).replace(/\r\n/gu, "\n");
    digest.update(`${name}\0${createHash("sha256").update(bytes).digest("hex")}\n`);
  }
  return digest.digest("hex");
}
