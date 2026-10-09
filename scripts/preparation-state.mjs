import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
export const hostPackages = ["runtime-core", "react", "runtime-conversation", "runtime-react", "plugins", "source-registry", "bootstrap", "mock-agent", "project-control"];
// A child may reuse preparation only for the exact inputs AND outputs its parent built.
// Legacy flags ("1"), deleted output, and edited source never qualify.
export function preparationState(packages) {
  const hash = createHash("sha256");
  function visit(relative) {
    let entries;
    try { entries = readdirSync(path.join(root, relative), { withFileTypes: true }); }
    catch (error) { if (error.code === "ENOENT") { hash.update(`missing:${relative}`); return; } throw error; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(relative, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) hash.update(file).update(readFileSync(path.join(root, file)));
    }
  }
  for (const name of packages) {
    hash.update(readFileSync(path.join(root, "packages", name, "package.json")));
    for (const directory of ["src", "scripts", "registry", "fixtures", "dist"]) visit(`packages/${name}/${directory}`);
  }
  hash.update(readFileSync(path.join(root, "pnpm-lock.yaml")));
  return hash.digest("hex");
}
