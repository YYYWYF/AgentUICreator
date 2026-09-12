import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function collectSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory()
      ? collectSourceFiles(fullPath)
      : /\.[jt]sx?$/u.test(entry.name) ? [fullPath] : [];
  }));
  return nested.flat();
}

describe("runtime-assistant-ui package policy", () => {
  it("depends only on canonical Runtime packages", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(packageRoot, "package.json"), "utf8"),
    ) as { dependencies: Record<string, string>; peerDependencies: Record<string, string> };
    const productionDependencies = [
      ...Object.keys(manifest.dependencies),
      ...Object.keys(manifest.peerDependencies),
    ];
    expect(productionDependencies.sort()).toEqual([
      "@ag-ui/client",
      "@agent-ui/runtime-core",
      "@assistant-ui/react",
      "@assistant-ui/react-ag-ui",
      "react",
    ].sort());
  });

  it("does not deep import or directly drive runAgent", async () => {
    const sources = await Promise.all(
      (await collectSourceFiles(path.join(packageRoot, "src")))
        .map((file) => readFile(file, "utf8")),
    );
    const combined = sources.join("\n");
    expect(combined).not.toMatch(/@assistant-ui\/[^"']+\/dist\/|AgUiThreadRuntimeCore|@assistant-ui\/core\/internal/u);
    expect(combined).not.toMatch(/\.runAgent\s*\(/u);
    expect(combined).not.toMatch(/AppUIModel|PluginRegistry|SlotRegistry|@agent-ui\/creator/u);
  });
});
