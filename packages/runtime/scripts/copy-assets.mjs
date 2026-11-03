import { cssAssetImport } from "./ui-assets.mjs";
import { rm, readdir, mkdir, copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildPublicDeclarationGraph,
  collectDeclarationFiles,
} from "./declaration-graph.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(packageRoot, "dist");

// Remove obsolete product-shell outputs from incremental builds.
await rm(path.join(distRoot, "ui", "runtime", "mode-shell"), { recursive: true, force: true });

await rm(path.join(distRoot, "experimental"), { recursive: true, force: true });

const { missing, reachable } = await buildPublicDeclarationGraph(distRoot);
if (missing.length > 0) {
  const details = missing.map(({ sourcePath, specifier }) =>
    `${path.relative(packageRoot, sourcePath)} -> ${specifier}`
  );
  throw new Error([
    "Cannot prune declarations because the public declaration graph is incomplete:",
    ...details,
  ].join("\n"));
}

for (const declarationPath of await collectDeclarationFiles(distRoot)) {
  if (!reachable.has(declarationPath)) {
    await rm(declarationPath);
    await rm(`${declarationPath}.map`, { force: true });
  }
}

// Filesystem operations use native paths; CSS references are logical POSIX paths.
const sourceRoot = path.join(packageRoot, "src", "ui");
const cssImports = [];
async function copyStyles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const source = path.join(directory, entry.name);
    if (entry.isDirectory()) await copyStyles(source);
    else if (entry.name.endsWith(".css")) {
      const relative = path.relative(sourceRoot, source);
      const target = path.join(distRoot, "ui", relative);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(source, target);
      cssImports.push(cssAssetImport(relative));
    }
  }
}
await copyStyles(sourceRoot);
await writeFile(path.join(distRoot, "ui", "styles.css"), cssImports.sort().join("\n") + "\n");
