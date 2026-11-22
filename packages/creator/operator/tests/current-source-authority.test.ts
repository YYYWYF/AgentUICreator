import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { installAgentUISourceItems, applyAgentUISourceItem } from "../src/project/source-registry/installer";
import { inspectAgentUISources } from "../src/project/source-registry/inspector";
import type { LoadedAgentUISourceItem, LoadedAgentUISourceRegistry, ResolvedSourceRelease } from "../src/source-catalog/index.js";
import { AgentUIUpdateService } from "../src/project/source-registry/updates";

const roots: string[] = [];
const config = { catalogs: [], nonPluginDirectories: [], uiPackages: [], agentUI: { sourceRoot: "src/agent-ui", metadataRoot: ".agent-ui" } };
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "current source 中文 ")); roots.push(root);
  await mkdir(path.join(root, "src/agent-ui"), { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ private: true }));
  const item: LoadedAgentUISourceItem = {
    id: "foundation/core", kind: "foundation", description: "Project source", itemRoot: root, manifestPath: path.join(root, "item.json"),
    files: [{ source: "config.ts", target: "config.ts" }],
    loadedFiles: [{ source: "config.ts", target: "config.ts", absolutePath: path.join(root, "config.ts"), content: Buffer.from("export const initial = true;\n") }],
  };
  const registry: LoadedAgentUISourceRegistry = { root, items: [item], byId: new Map([[item.id, item]]) };
  await installAgentUISourceItems(root, [item.id], config, registry);
  return { root, item, registry };
}

it("accepts external edits and renamed files without comparing historical hashes or rewriting receipts", async () => {
  const { root, item, registry } = await fixture();
  const lockPath = path.join(root, ".agent-ui/source-lock.json");
  const receipt = await readFile(lockPath, "utf8");
  expect(receipt).not.toContain("sha256");
  const source = path.join(root, "src/agent-ui/config.ts");
  await writeFile(source, "export const changedByAnotherAgent = true;\r\n");
  const inspection = await inspectAgentUISources(root, config, registry);
  expect(inspection.items[0]).toMatchObject({ status: "managed", issues: [], updateAvailable: false });
  expect(await applyAgentUISourceItem(root, { itemId: item.id, expectedStateHash: inspection.stateHash }, config, registry)).toMatchObject({ changed: false });
  expect(await readFile(source, "utf8")).toContain("changedByAnotherAgent");
  await rename(source, path.join(root, "src/agent-ui/renamed.ts"));
  expect((await inspectAgentUISources(root, config, registry)).items[0]).toMatchObject({ status: "managed", issues: [] });
  expect(await readFile(lockPath, "utf8")).toBe(receipt);
});

it("preserves actual existing dependencies when installing another resource, including stale plans", async () => {
  const { root, item, registry } = await fixture();
  const source = path.join(root, "src/agent-ui/config.ts");
  await writeFile(source, "export const userCode = true;\n");
  item.loadedFiles[0]!.content = Buffer.from("export const newerTemplate = true;\n");
  const example: LoadedAgentUISourceItem = { ...item, id: "demo/frontend-tool-dialog", kind: "demo", requires: [item.id],
    files: [{ source: "business.ts", target: "business.ts" }],
    loadedFiles: [{ source: "business.ts", target: "business.ts", absolutePath: path.join(root, "business.ts"), content: Buffer.from("export const business = true;\n") }],
  };
  const withExample: LoadedAgentUISourceRegistry = { ...registry, items: [...registry.items, example], byId: new Map([...registry.byId, [example.id, example]]) };
  const before = await inspectAgentUISources(root, config, withExample);
  await writeFile(source, "export const newestUserCode = true;\n");
  await expect(applyAgentUISourceItem(root, { itemId: example.id, expectedStateHash: before.stateHash }, config, withExample)).rejects.toMatchObject({ code: "AGENT_UI_SOURCE_STATE_CONFLICT" });
  const current = await inspectAgentUISources(root, config, withExample);
  await applyAgentUISourceItem(root, { itemId: example.id, expectedStateHash: current.stateHash }, config, withExample);
  expect(await readFile(source, "utf8")).toContain("newestUserCode");
  expect(await readFile(path.join(root, "src/agent-ui/business.ts"), "utf8")).toContain("business");
});

it("plans legacy source updates from current files without resolving any historical release", async () => {
  const { root } = await fixture();
  await writeFile(path.join(root, ".agent-ui/project.json"), JSON.stringify({ mode: "assistant", sourceRoot: config.agentUI.sourceRoot }));
  const id = "conversation-surface", prefix = `plugins/${id}`;
  const directory = path.join(root, "src/agent-ui", ...prefix.split("/"));
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "manifest.json"), JSON.stringify({ id, version: "1.0.0" }));
  await writeFile(path.join(directory, "index.tsx"), "export const changedByAnotherAgent = true;\n");
  await writeFile(path.join(directory, "project-only.ts"), "export const projectOnly = true;\n");
  await writeFile(path.join(root, ".agent-ui/source-lock.json"), JSON.stringify({ sourceRoot: config.agentUI.sourceRoot, items: {
    [`plugin/${id}`]: { pluginVersion: "0.0.1", sourceRelease: "0.0.1", files: { [`${prefix}/index.tsx`]: { sha256: "obsolete" } } },
  } }));
  const contents = new Map([
    [`${prefix}/manifest.json`, Buffer.from(JSON.stringify({ id, version: "2.0.0" }))],
    [`${prefix}/index.tsx`, Buffer.from("export const newFeature = true;\n")],
  ]);
  const item: LoadedAgentUISourceItem = { id: `plugin/${id}`, kind: "agent-component", description: "Current target", itemRoot: root, manifestPath: path.join(root, "item.json"),
    files: [...contents.keys()].map(target => ({ source: target, target })),
    loadedFiles: [...contents].map(([target, content]) => ({ source: target, target, absolutePath: path.join(root, ...target.split("/")), content })),
  };
  const release: ResolvedSourceRelease = { descriptor: { releaseVersion: "2.0.0", contractVersion: 1, plugins: { [id]: { version: "2.0.0" } } },
    registry: { root, items: [item], byId: new Map([[item.id, item]]) }, changelogs: {},
  };
  const requested: string[] = [];
  const service = new AgentUIUpdateService({ getLatestRelease: async () => release.descriptor, resolveRelease: async version => {
    requested.push(version);
    if (version !== "2.0.0") throw new Error("Historical releases are unavailable");
    return release;
  } });
  const plan = await service.plan(root, [id], "2.0.0");
  expect(plan).toMatchObject({ blocked: false, requiresMerge: true });
  expect(plan.items[0]?.currentVersion).toBe("1.0.0");
  const merge = await service.merge(root, plan.id);
  expect(merge.files.some(file => file.path.endsWith("project-only.ts") && file.target === null)).toBe(true);
  expect(merge.files.every(file => !Object.hasOwn(file, "base"))).toBe(true);
  expect(requested).toEqual(["2.0.0"]);
  expect(await readFile(path.join(directory, "index.tsx"), "utf8")).toContain("changedByAnotherAgent");
});
