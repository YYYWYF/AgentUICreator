import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(packageRoot, "dist");

async function removeInternalDeclarations(root, relativeRoot = "") {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    const relativePath = path.join(relativeRoot, entry.name);
    if (entry.isDirectory()) {
      await removeInternalDeclarations(entryPath, relativePath);
      continue;
    }
    const isPublicDeclaration = relativePath === "index.d.ts" ||
      relativePath === "public.d.ts";
    if (!isPublicDeclaration &&
      (entry.name.endsWith(".d.ts") || entry.name.endsWith(".d.ts.map"))) {
      await rm(entryPath);
    }
  }
}

await removeInternalDeclarations(distRoot);
