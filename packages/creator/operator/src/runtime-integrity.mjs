import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
export function assertRuntimeBuildCurrent(buildId) {
  if (!buildId) return; // Direct source tests have no compiled module cache.
  try {
    const packageRoot = fileURLToPath(new URL("..", import.meta.url));
    const manifest = JSON.parse(readFileSync(path.join(packageRoot, "dist/runtime/build.json"), "utf8"));
    if (manifest.buildId !== buildId) throw new Error("The loaded Operator build was replaced.");
    // Published installations contain no workspace source. Local development does.
    let toolRoot = packageRoot;
    for (;;) {
      const metadata = path.join(toolRoot, "package.json");
      if (existsSync(metadata) && JSON.parse(readFileSync(metadata, "utf8")).name === "@za38.03/agent-ui-creator") break;
      const parent = path.dirname(toolRoot);
      if (parent === toolRoot) throw new Error("Creator installation identity is unavailable.");
      toolRoot = parent;
    }
    const workspace = path.resolve(toolRoot, "../..");
    if (existsSync(path.join(workspace, "scripts/prepare-workbench.mjs"))) {
      for (const [file, hash] of Object.entries(manifest.inputs)) {
        const current = createHash("sha256").update(readFileSync(path.join(workspace, file))).digest("hex");
        if (current !== hash) throw new Error(`Operator input changed: ${file}`);
      }
    }
  } catch (cause) {
    throw Object.assign(new Error("Operator is out of date or unavailable. Restart Creator using pnpm dev.", { cause }), { code: "CREATOR_OPERATOR_RESTART_REQUIRED" });
  }
}
