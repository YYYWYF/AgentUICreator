import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const failures = [];
const exact = /^(?:npm:[^@]+@)?\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/u;
const skipped = new Set(["node_modules", "dist", ".git", ".generated", "fixtures", "vendor"]);
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory() && !skipped.has(entry.name)) await visit(file);
    if (!entry.isFile() || !["package.json", "item.json"].includes(entry.name)) continue;
    await check(file);
  }
}
async function check(file) {
  const manifest = JSON.parse(await readFile(file, "utf8"));
  for (const field of ["dependencies", "devDependencies", "optionalDependencies", "packages"]) {
    for (const [name, version] of Object.entries(manifest[field] ?? {})) {
      if (version !== "workspace:*" && !exact.test(version)) failures.push(`${path.relative(root, file)} ${field}: ${name}=${version}`);
    }
  }
}
await check(path.join(root, "package.json"));
for (const directory of ["packages", "apps", "examples", "scripts"]) await visit(path.join(root, directory));
const pythonManifest = await readFile(path.join(root, "packages/creator-python/pyproject.toml"), "utf8");
for (const block of pythonManifest.matchAll(/(?:dependencies|requires|test)\s*=\s*\[([\s\S]*?)\]/gu)) {
  for (const quoted of block[1].matchAll(/"([^"]+)"/gu)) {
    if (!/^[\w.-]+==[^\s,]+$/u.test(quoted[1])) failures.push(`pyproject.toml: ${quoted[1]}`);
  }
}
const pythonLock = await readFile(path.join(root, "packages/creator-python/requirements.lock"), "utf8");
for (const line of pythonLock.split(/\r?\n/u)) {
  if (line.trim() && !line.startsWith("#") && !/^[\w.-]+==[^\s,]+$/u.test(line)) failures.push(`requirements.lock: ${line}`);
}
if (failures.length) throw new Error(`Dependencies must use exact versions:\n${failures.join("\n")}`);
console.log("All active JS/Python dependency manifests and Source Registry package requirements use exact versions. Peer compatibility ranges are not install pins.");
