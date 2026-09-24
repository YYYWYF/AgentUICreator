import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

const scriptsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scripts/ui-project");

async function sources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sources(target);
    return entry.isFile() && target.endsWith(".ts") ? [target] : [];
  }))).flat();
}

it("keeps managed Plugin and AppUI paths in the project path resolver", async () => {
  const exceptions = new Set(["agent-ui-project-paths.ts", "project-initializer.ts"]);
  const violations: string[] = [];
  for (const file of await sources(scriptsRoot)) {
    if (exceptions.has(path.basename(file))) continue;
    const source = await readFile(file, "utf8");
    if (/path\.join\(\s*(?:projectRoot|resolvedProjectRoot)\s*,\s*["'](?:plugins|app-ui)["']/u.test(source)) {
      violations.push(path.relative(scriptsRoot, file));
    }
  }
  expect(violations).toEqual([]);
});
