import { mkdtemp, mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { installAgentUISourceItems, applyAgentUISourceItem, removeAgentUISourceItems } from "../src/project/source-registry/installer";
import { inspectAgentUISources } from "../src/project/source-registry/inspector";
import { readAgentUISourceLock, serializeAgentUISourceLock } from "../src/project/source-registry/lock";
import type { LoadedAgentUISourceRegistry } from "../src/source-catalog/index.js";
import { validateOperatorResult } from "../src/result-contract.mjs";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const config = { catalogs: [], nonPluginDirectories: [], uiPackages: [], agentUI: { sourceRoot: "src/agent-ui", metadataRoot: ".agent-ui" } };
it("imports examples as business files without BASE hashes or official updates", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "example ownership 中文 ")); roots.push(root);
  await mkdir(path.join(root, "src/agent-ui"), { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ private: true }));
  const item = { id: "demo/frontend-tool-dialog", kind: "demo" as const, description: "Example", itemRoot: root, manifestPath: path.join(root, "item.json"), files: [{ source: "index.ts", target: "business.ts" }], loadedFiles: [{ source: "index.ts", target: "business.ts", absolutePath: path.join(root, "index.ts"), content: Buffer.from("export const value = 1;\n") }] };
  const registry = { root, items: [item], byId: new Map([[item.id, item]]) } as LoadedAgentUISourceRegistry;
  await installAgentUISourceItems(root, [item.id], config, registry);
  const { lock } = await readAgentUISourceLock(root, config);
  expect(lock.items).not.toHaveProperty(item.id);
  expect(lock.examples?.[item.id]).toEqual({ files: ["business.ts"] });
  expect(serializeAgentUISourceLock(lock).toString()).not.toContain("sha256");
  await writeFile(path.join(root, "src/agent-ui/business.ts"), "export const myBusiness = true;\n");
  item.loadedFiles[0]!.content = Buffer.from("export const newOfficialExample = true;\n");
  item.files.push({ source: "new.ts", target: "new-business.ts" });
  item.loadedFiles.push({ source: "new.ts", target: "new-business.ts", absolutePath: path.join(root, "new.ts"), content: Buffer.from("export const newTemplateFile = true;\n") });
  Object.assign(item, { packages: { "new-template-only-package": "1.0.0" } });
  const inspection = await inspectAgentUISources(root, config, registry);
  expect(() => validateOperatorResult("inspect_agent_ui_sources", inspection)).not.toThrow();
  expect(inspection.items[0]).toMatchObject({ projectOwned: true, updateAvailable: false, requirements: [], resolvedRequirements: [], issues: [] });
  expect(inspection.items[0]?.files).toHaveLength(1);
  await expect(applyAgentUISourceItem(root, { itemId: item.id, expectedStateHash: inspection.stateHash }, config, registry)).rejects.toMatchObject({ code: "AGENT_UI_EXAMPLE_PROJECT_OWNED" });
  await expect(removeAgentUISourceItems(root, { itemIds: [item.id], expectedStateHash: inspection.stateHash }, config, registry)).rejects.toMatchObject({ code: "AGENT_UI_SOURCE_ITEM_NOT_INSTALLED" });
  expect(await readFile(path.join(root, "src/agent-ui/business.ts"), "utf8")).toContain("myBusiness");
  await expect(readFile(path.join(root, "src/agent-ui/new-business.ts"))).rejects.toMatchObject({ code: "ENOENT" });
  await rename(path.join(root, "src/agent-ui/business.ts"), path.join(root, "src/agent-ui/my-business.ts"));
  expect((await inspectAgentUISources(root, config, registry)).items[0]).toMatchObject({ projectOwned: true, status: "customized", issues: [] });
});

it("reads legacy demo hashes as path-only records while retaining official source baselines", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "example legacy ")); roots.push(root);
  await mkdir(path.join(root, ".agent-ui"));
  const digest = "a".repeat(64);
  await writeFile(path.join(root, ".agent-ui/source-lock.json"), JSON.stringify({
    sourceRoot: config.agentUI.sourceRoot,
    items: {
      "demo/frontend-tool-dialog": { files: { "plugins/business/index.tsx": { sha256: digest } } },
      "foundation/core": { files: { "config.ts": { sha256: digest } } },
    },
  }));
  const { lock } = await readAgentUISourceLock(root, config);
  expect(lock.examples).toEqual({ "demo/frontend-tool-dialog": { files: ["plugins/business/index.tsx"] } });
  expect(lock.items).toEqual({ "foundation/core": { files: { "config.ts": { sha256: digest } } } });
  expect(JSON.parse(serializeAgentUISourceLock(lock).toString()).items).not.toHaveProperty("demo/frontend-tool-dialog");
  // Inspection alone does not rewrite even legacy project metadata.
  expect(await readFile(path.join(root, ".agent-ui/source-lock.json"), "utf8")).toContain('"demo/frontend-tool-dialog":{"files":{');
});

it.each(["../business.ts", "C:/business.ts", "C:\\business.ts", "plugins\\business.ts", "/business.ts"])("rejects unsafe example logical target %s on every platform", async target => {
  const root = await mkdtemp(path.join(tmpdir(), "example paths ")); roots.push(root);
  await mkdir(path.join(root, ".agent-ui"));
  await writeFile(path.join(root, ".agent-ui/source-lock.json"), JSON.stringify({
    sourceRoot: config.agentUI.sourceRoot, items: {},
    examples: { "demo/frontend-tool-dialog": { files: [target] } },
  }));
  await expect(readAgentUISourceLock(root, config)).rejects.toMatchObject({ code: "AGENT_UI_SOURCE_INVALID_PATH" });
});
