// @vitest-environment node
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
import { createCustomPlugin } from "../src/project/create-custom-plugin";
import { planPluginPurge, purgeUIPlugin } from "../src/project/plugin-purge";
import { resourcePaths } from "../src/project/optional-resource-paths";
import { inspectAgentUISources } from "../src/project/source-registry/inspector";
import { sha256 } from "../src/project/source-registry/lock";
import { verifyUIProject } from "../src/verify-ui";
import { repositoryRoot } from "./support/generated-project";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

it("creates and purges a custom Plugin with real dependencies under a Unicode path without changing linked dependencies", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "Plugin operations 工程 "));
  roots.push(root);
  await promisify(execFile)(process.execPath, [
    path.join(repositoryRoot, "packages/creator/python/tests/fixtures/phase3/prepare-host.mjs"),
    root, repositoryRoot, "assistant",
  ]);
  const dependency = "node_modules/react/package.json";
  const beforeDependency = await readFile(path.join(root, dependency));
  const created = await createCustomPlugin(root, {
    pluginId: "windows-card", capabilities: ["headless"], placement: { type: "application" },
  }, async staged => {
    expect(await readFile(path.join(staged, dependency))).toEqual(beforeDependency);
  });
  expect(created.changedPaths.every(file => !file.includes("\\"))).toBe(true);
  const { paths, config } = await resourcePaths(root);
  const pluginFile = path.join(paths.pluginsRoot, "windows-card/definition.ts");
  const beforePlugin = await readFile(pluginFile);
  const input = { pluginId: "windows-card", appUIModelHash: sha256(await readFile(paths.appUIModelPath)),
    sourceStateHash: (await inspectAgentUISources(root, config)).stateHash };
  const plan = await planPluginPurge(root, input);
  expect(plan.removedPluginIds).toContain("windows-card");
  expect(await readFile(pluginFile)).toEqual(beforePlugin);
  expect(await readFile(path.join(root, dependency))).toEqual(beforeDependency);
  const result = await purgeUIPlugin(root, input);
  expect(result.verification).toBe("passed");
  expect(result.changedPaths.every(file => !file.includes("\\"))).toBe(true);
  await expect(readFile(pluginFile)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(path.join(root, dependency))).toEqual(beforeDependency);
  expect((await verifyUIProject(root)).status).toBe("passed");
}, 120_000);
