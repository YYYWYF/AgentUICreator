// @vitest-environment node
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { minVersion } from "semver";
import { MockUpdateSourceProvider, resolveAgentUISourceItemClosure, resolveSourceRelease, DEFAULT_AGENT_UI_SOURCE_REGISTRY_ROOT } from "@agent-ui/source-registry";
import { AgentUIUpdateService } from "../../src/project/source-registry/updates";
import { installAgentUISourceItems } from "../../src/project/source-registry/installer";
import { readAgentUIProjectConfig } from "../../src/project/project-mode";
import { resolveAgentUIProjectPaths, projectControlConfigForPaths } from "../../src/project/agent-ui-project-paths";
import { readAgentUISourceLock } from "../../src/project/source-registry/lock";
const verification = vi.hoisted(() => ({ status: "passed" }));
vi.mock("../../src/verify-ui", () => ({ verifyUIProject: vi.fn(async () => ({ status: verification.status, errors: [] })) }));
vi.mock("../../src/generate-plugin-registry", () => ({ writeGeneratedPluginRegistry: vi.fn(async () => ({ changed: false })) }));
vi.mock("../../src/generate-frontend-tool-registry", () => ({ writeGeneratedFrontendToolRegistries: vi.fn(async () => ({ changedPaths: [] })) }));
vi.mock("../../src/generate-conversation-integration-registry", () => ({ writeGeneratedConversationIntegrationRegistry: vi.fn(async () => ({ changedPaths: [] })) }));
const roots: string[] = [];
afterEach(async () => { verification.status = "passed"; await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture(currentRegistry = false) {
  const root = await mkdtemp(path.join(tmpdir(), "plugin-updates-")); roots.push(root);
  await mkdir(path.join(root, ".agent-ui"));
  await writeFile(path.join(root, ".agent-ui/project.json"), JSON.stringify({ mode: "platform", sourceRoot: "agent-ui" }));
  const provider = new MockUpdateSourceProvider();
  const release = currentRegistry ? await resolveSourceRelease(DEFAULT_AGENT_UI_SOURCE_REGISTRY_ROOT) : await provider.resolveRelease("0.0.1");
  const items = resolveAgentUISourceItemClosure(release.registry, "plugin/conversation-surface");
  const packages = Object.assign({}, ...items.map(item => item.packages));
  await writeFile(path.join(root, "package.json"), JSON.stringify({ dependencies: packages }));
  for (const [name, range] of Object.entries(packages)) {
    const dir = path.join(root, "node_modules", name); await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "package.json"), JSON.stringify({ name, version: minVersion(range as string)!.version }));
  }
  const project = await readAgentUIProjectConfig(root);
  const config = projectControlConfigForPaths(resolveAgentUIProjectPaths(root, project.config));
  await installAgentUISourceItems(root, ["plugin/conversation-surface"], config, release.registry);
  return { root, config, provider, service: new AgentUIUpdateService(provider), filename: path.join(root, "agent-ui/plugins/conversation-surface/index.tsx") };
}
it("plans before atomic updates and refuses a stale authorized plan", async () => {
  const f = await fixture();
  const inspection = await f.service.inspect(f.root);
  expect(inspection.plugins.find(plugin => plugin.pluginId === "conversation-surface")).toMatchObject({ currentVersion: "0.0.1", targetVersion: "0.0.2", updateAvailable: true, status: "managed" });
  const plan = await f.service.plan(f.root, ["conversation-surface"], inspection.releaseVersion);
  expect(plan.requiresMerge).toBe(false);
  const original = await readFile(f.filename, "utf8");
  await writeFile(f.filename, original + "\n// local edit\n");
  await expect(f.service.execute(f.root, plan.id)).rejects.toThrow(/过期/);
  expect(await readFile(f.filename, "utf8")).toContain("local edit");
  await writeFile(f.filename, original);
  const next = await f.service.plan(f.root, ["conversation-surface"], "0.0.2");
  await f.service.execute(f.root, next.id);
  expect((await readAgentUISourceLock(f.root, f.config)).lock.items["plugin/conversation-surface"]).toMatchObject({ pluginVersion: "0.0.2", sourceRelease: "0.0.2" });
});
it("keeps user edits, gates adoption on verify, and obtains the next BASE from the adopted release", async () => {
  const f = await fixture();
  await writeFile(f.filename, (await readFile(f.filename, "utf8")) + "\n// local edit\n");
  const plan = await f.service.plan(f.root, ["conversation-surface"], "0.0.2");
  expect(plan.requiresMerge).toBe(true);
  await expect(f.service.execute(f.root, plan.id)).rejects.toThrow(/禁止直接覆盖/);
  const merge = await f.service.merge(f.root, plan.id);
  expect(merge.files.find(file => file.path.endsWith("index.tsx"))?.base).not.toContain("Mock release 0.0.2");
  for (const file of merge.files) if (file.target !== null) await writeFile(path.join(f.root, file.path), file.target + (file.path.endsWith("index.tsx") ? "\n// local edit\n" : ""));
  verification.status = "failed";
  await expect(f.service.adopt(f.root, plan.id)).rejects.toThrow(/验证失败/);
  expect((await readAgentUISourceLock(f.root, f.config)).lock.items["plugin/conversation-surface"]?.pluginVersion).toBe("0.0.1");
  verification.status = "passed";
  await f.service.adopt(f.root, plan.id);
  expect((await f.service.inspect(f.root)).plugins.find(plugin => plugin.pluginId === "conversation-surface")).toMatchObject({ currentVersion: "0.0.2", status: "customized", updateAvailable: false });
  const target = await f.provider.resolveRelease("0.0.2");
  target.registry.sourceRelease = "0.0.3"; target.descriptor.releaseVersion = "0.0.3"; target.descriptor.plugins["conversation-surface"]!.version = "0.0.3";
  const nextService = new AgentUIUpdateService({ getLatestRelease: async () => target.descriptor, resolveRelease: async version => version === "0.0.3" ? target : f.provider.resolveRelease(version) });
  // The next merge must use the adopted release as BASE.
  expect((await readAgentUISourceLock(f.root, f.config)).lock.items["plugin/conversation-surface"]?.sourceRelease).toBe("0.0.2");
  const manifest = target.registry.byId.get("plugin/conversation-surface")!.loadedFiles.find(file => file.target.endsWith("manifest.json"))!;
  manifest.content = Buffer.from(manifest.content.toString().replace('"0.0.2"', '"0.0.3"'));
  const nextPlan = await nextService.plan(f.root, ["conversation-surface"], "0.0.3");
  expect((await nextService.merge(f.root, nextPlan.id)).files.find(file => file.path.endsWith("index.tsx"))?.base).toContain("Mock release 0.0.2");
});
it("rolls back source and lock when managed verification fails", async () => {
  const f = await fixture();
  const before = await readFile(f.filename);
  const lockBefore = (await readAgentUISourceLock(f.root, f.config)).source;
  const plan = await f.service.plan(f.root, ["conversation-surface"], "0.0.2");
  verification.status = "failed";
  await expect(f.service.execute(f.root, plan.id)).rejects.toThrow();
  expect(await readFile(f.filename)).toEqual(before);
  expect((await readAgentUISourceLock(f.root, f.config)).source).toEqual(lockBefore);
});
it("discovers updates but prevents incompatible execution", async () => {
  const f = await fixture();
  const service = new AgentUIUpdateService(f.provider, "0.1.0", 0);
  expect((await service.inspect(f.root)).compatibility).toBe("creator-upgrade-required");
  const plan = await service.plan(f.root, ["conversation-surface"], "0.0.2");
  expect(plan.blocked).toBe(true);
  await expect(service.execute(f.root, plan.id)).rejects.toThrow(/不兼容/);
});
it("includes changed foundations and a newly required plugin in one atomic plan", async () => {
  const f = await fixture();
  const target = await f.provider.resolveRelease("0.0.2");
  target.registry.byId.get("plugin/conversation-surface")!.requires!.push("plugin/theme-provider");
  const foundation = target.registry.byId.get("foundation/core")!.loadedFiles.find(file => file.target === "index.ts")!;
  foundation.content = Buffer.from(foundation.content.toString() + "\n// upgraded foundation\n");
  const service = new AgentUIUpdateService({ getLatestRelease: async () => target.descriptor, resolveRelease: async version => version === "0.0.2" ? target : f.provider.resolveRelease(version) });
  const plan = await service.plan(f.root, ["conversation-surface"], "0.0.2");
  expect(plan.items.find(item => item.itemId === "plugin/theme-provider")).toMatchObject({ changed: true, status: "not-installed" });
  expect(plan.items.find(item => item.itemId === "foundation/core")).toMatchObject({ changed: true, paths: ["index.ts"] });
  await service.execute(f.root, plan.id);
  const lock = (await readAgentUISourceLock(f.root, f.config)).lock;
  expect(lock.items["plugin/theme-provider"]).toMatchObject({ pluginVersion: "0.0.1", sourceRelease: "0.0.2" });
  expect(await readFile(path.join(f.root, "agent-ui/index.ts"), "utf8")).toContain("upgraded foundation");
});
it("upgrades a project initialized from the current Registry along the default Mock release chain", async () => {
  const f = await fixture(true);
  expect((await readAgentUISourceLock(f.root, f.config)).lock.items["plugin/conversation-surface"]).toMatchObject({ pluginVersion: "0.0.1", sourceRelease: "0.1.0" });
  const inspection = await f.service.inspect(f.root);
  expect(inspection.releaseVersion).toBe("0.1.1");
  expect(inspection.plugins.find(plugin => plugin.pluginId === "conversation-surface")).toMatchObject({ currentVersion: "0.0.1", targetVersion: "0.0.2" });
  const plan = await f.service.plan(f.root, ["conversation-surface"], inspection.releaseVersion);
  expect(plan.blocked).toBe(false);
  await f.service.execute(f.root, plan.id);
  expect((await readAgentUISourceLock(f.root, f.config)).lock.items["plugin/conversation-surface"]).toMatchObject({ pluginVersion: "0.0.2", sourceRelease: "0.1.1" });
});
it("blocks an older package release even when its Plugin version would advance", async () => {
  const f = await fixture(true);
  const before = (await readAgentUISourceLock(f.root, f.config)).source;
  const plan = await f.service.plan(f.root, ["conversation-surface"], "0.0.2");
  expect(plan.blocked).toBe(true);
  expect(plan.issues.some(issue => issue.includes("AGENT_UI_UPDATE_RELEASE_REGRESSION"))).toBe(true);
  await expect(f.service.execute(f.root, plan.id)).rejects.toThrow(/阻塞/);
  expect((await readAgentUISourceLock(f.root, f.config)).source).toEqual(before);
});
