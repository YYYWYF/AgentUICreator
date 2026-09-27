import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../..", import.meta.url));
async function productionFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["node_modules", "dist", "build", ".git", "tests", "__tests__", "fixtures", ".agent-ui", ".agentuicreator", ".venv", "coverage"].includes(entry.name)) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await productionFiles(filename));
    else if (/\.(?:ts|tsx|mts|js|mjs)$/.test(entry.name) && !/\.(?:test|spec)\./.test(entry.name)) files.push(filename);
  }
  return files;
}
it("restricts low-level Source apply/remove to the canonical Host orchestrator", async () => {
  const allowed = new Set([
    "packages/project-control/src/project/source-registry/installer.ts", // API declarations and storage implementation
    "packages/project-control/src/project/source-registry/index.ts", // compatibility re-exports
    "packages/project-control/src/project/source-registry/project-mutation.ts",
  ]);
  const offenders: string[] = [];
  for (const directory of ["apps", "packages", "examples", "scripts"]) {
    for (const filename of await productionFiles(path.join(root, directory))) {
      const relative = path.relative(root, filename).split(path.sep).join("/");
      if (!allowed.has(relative) && /\b(?:applyAgentUISourceItem|removeAgentUISourceItems)\b/.test(await readFile(filename, "utf8"))) offenders.push(relative);
    }
  }
  expect(offenders).toEqual([]);
});
