import { cp, mkdir, readdir, rm, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(packageRoot, "src");
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

await mkdir(distRoot, { recursive: true });
await copyFile(path.join(sourceRoot, "styles.css"), path.join(distRoot, "styles.css"));
await copyFile(
  path.join(sourceRoot, "preflight.scoped.css"),
  path.join(distRoot, "preflight.scoped.css"),
);
await mkdir(
  path.join(distRoot, "internal", "vendor", "assistant-ui"),
  { recursive: true },
);
await cp(
  path.join(sourceRoot, "internal", "vendor", "assistant-ui", "UPSTREAM.md"),
  path.join(distRoot, "internal", "vendor", "assistant-ui", "UPSTREAM.md"),
  { recursive: true },
);
await cp(
  path.join(sourceRoot, "internal", "vendor", "assistant-ui", "UPSTREAM.json"),
  path.join(distRoot, "internal", "vendor", "assistant-ui", "UPSTREAM.json"),
  { recursive: true },
);
await cp(
  path.join(sourceRoot, "internal", "vendor", "assistant-ui", "assistant-ui-upstream.lock.json"),
  path.join(distRoot, "internal", "vendor", "assistant-ui", "assistant-ui-upstream.lock.json"),
  { recursive: true },
);
await copyFile(
  path.join(packageRoot, "THIRD_PARTY_NOTICES.md"),
  path.join(distRoot, "THIRD_PARTY_NOTICES.md"),
);
await removeInternalDeclarations(distRoot);
