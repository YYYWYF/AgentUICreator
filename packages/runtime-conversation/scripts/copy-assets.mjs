import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildDeclarationGraph,
  collectDeclarationFiles,
} from "./declaration-graph.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(packageRoot, "dist");

const entryPath = path.join(distRoot, "index.d.ts");
const { missing, reachable } = await buildDeclarationGraph(distRoot, entryPath);
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
