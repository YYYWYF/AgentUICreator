import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { projectCommandPaths } from "../src/agent/activity.js";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
it.each(["flat", "nested", "legacy"])("binds command admission and recovery to %s project files", async layout => {
  const root = await mkdtemp(path.join(tmpdir(), "Creator paths 中文 ")); roots.push(root);
  await mkdir(path.join(root, ".agent-ui"));
  await writeFile(path.join(root, ".agent-ui/project.json"), JSON.stringify({ sourceRoot: "src/ui" }));
  const model = layout === "flat" ? "src/ui/app-ui.json" : "src/ui/app-ui/app-ui.json";
  const settings = layout === "flat" ? "src/ui/config.ts" : layout === "nested" ? "src/ui/agent-ui/config.ts" : "src/ui/agent-ui/theme/theme-config.ts";
  for (const file of [model, settings]) { await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await writeFile(path.join(root, file), "{}"); }
  expect(await projectCommandPaths(root)).toEqual({ source: "src/ui", model, settings, registry: "src/ui/plugins/registry.generated.ts" });
});
