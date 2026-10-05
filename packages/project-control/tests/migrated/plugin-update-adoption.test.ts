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
import { writeGeneratedPluginRegistry } from "../../src/generate-plugin-registry";
import { writeGeneratedFrontendToolRegistries } from "../../src/generate-frontend-tool-registry";
import { writeGeneratedConversationIntegrationRegistry } from "../../src/generate-conversation-integration-registry";
const control = vi.hoisted(() => ({ failVerify: false, expectedName: "", observedChanged: false }));
vi.mock("../../src/verify-ui", async importOriginal => {
  const actual = await importOriginal<typeof import("../../src/verify-ui")>();
  return { ...actual, verifyUIProject: async (...args: Parameters<typeof actual.verifyUIProject>) => {
    // Exercise real generation and verification; failure is injected only after
    // confirming derived outputs have already incorporated the merged manifest.
    const catalog = await readFile(path.join(args[0], "agent-ui/plugins/registry.generated.ts"), "utf8");
    control.observedChanged = catalog.includes(control.expectedName);
    if (control.failVerify) return { status: "failed", errors: ["Injected verification failure"] };
    return actual.verifyUIProject(...args);
  } };
});
const roots: string[] = [];
afterEach(async () => { control.failVerify = false; control.expectedName = ""; control.observedChanged = false; await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const generated = ["plugins/registry.generated.ts", "agent-contract/frontend-tools.generated.ts", "agent-ui/conversation/frontend-tool-uis.generated.ts", "agent-ui/conversation/integrations.generated.tsx"];
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "plugin-adopt-")); roots.push(root);
  await mkdir(path.join(root, ".agent-ui"));
  await writeFile(path.join(root, ".agent-ui/project.json"), JSON.stringify({ mode: "platform", sourceRoot: "agent-ui" }));
  const release = await resolveSourceRelease(DEFAULT_AGENT_UI_SOURCE_REGISTRY_ROOT);
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
  await mkdir(path.join(root, "agent-ui/app-ui"), { recursive: true });
  await writeFile(path.join(root, "agent-ui/app-ui/app-ui.json"), JSON.stringify({ root: { type: "slot", plugins: [] } }));
  await writeGeneratedPluginRegistry(root); await writeGeneratedFrontendToolRegistries(root); await writeGeneratedConversationIntegrationRegistry(root);
  const provider = new MockUpdateSourceProvider(); const service = new AgentUIUpdateService(provider);
  const filename = path.join(root, "agent-ui/plugins/conversation-surface/index.tsx");
  await writeFile(filename, (await readFile(filename, "utf8")) + "\n// user customization\n");
  const plan = await service.plan(root, ["conversation-surface"], "0.1.1");
  expect(plan.requiresMerge).toBe(true); expect(plan.blocked).toBe(false);
  await service.startManualMerge(root, plan.id);
  const target = await provider.resolveRelease("0.1.1");
  const plugin = target.registry.byId.get("plugin/conversation-surface")!;
  for (const file of plugin.loadedFiles) await writeFile(path.join(root, "agent-ui", file.target), file.content.toString() + (file.target.endsWith("index.tsx") ? "\n// user customization\n" : ""));
  control.expectedName = "Conversation Surface (Mock 0.1.1)";
  return { root, config, service, filename, plan, plugin };
}
it("regenerates real derived registries for manual merges before verifying and advancing the baseline", async () => {
  const f = await fixture();
  const userSource = await readFile(f.filename);
  expect(await readFile(path.join(f.root, "agent-ui/plugins/registry.generated.ts"), "utf8")).not.toContain(control.expectedName);
  await f.service.adopt(f.root, f.plan.id);
  expect(control.observedChanged).toBe(true);
  expect((await readAgentUISourceLock(f.root, f.config)).lock.items["plugin/conversation-surface"]).toMatchObject({ pluginVersion: "0.0.2", sourceRelease: "0.1.1" });
  expect(await readFile(f.filename)).toEqual(userSource);
  expect((await f.service.inspect(f.root)).plugins.find(plugin => plugin.pluginId === "conversation-surface")?.status).toBe("customized");
});
it("rolls back regenerated artifacts and lock while preserving merged source and a retryable plan", async () => {
  const f = await fixture();
  const before = await Promise.all(generated.map(relative => readFile(path.join(f.root, "agent-ui", relative))));
  const lockBefore = (await readAgentUISourceLock(f.root, f.config)).source;
  const sourceBefore = await Promise.all(f.plugin.loadedFiles.map(file => readFile(path.join(f.root, "agent-ui", file.target))));
  control.failVerify = true;
  await expect(f.service.adopt(f.root, f.plan.id)).rejects.toThrow(/验证失败/);
  expect(control.observedChanged).toBe(true);
  expect(await Promise.all(generated.map(relative => readFile(path.join(f.root, "agent-ui", relative))))).toEqual(before);
  expect((await readAgentUISourceLock(f.root, f.config)).source).toEqual(lockBefore);
  expect(await Promise.all(f.plugin.loadedFiles.map(file => readFile(path.join(f.root, "agent-ui", file.target))))).toEqual(sourceBefore);
  await expect(readFile(path.join(f.root, f.config.agentUI.metadataRoot, "source-project-transaction.json"))).rejects.toMatchObject({ code: "ENOENT" });
  control.failVerify = false;
  await f.service.adopt(f.root, f.plan.id);
  expect((await readAgentUISourceLock(f.root, f.config)).lock.items["plugin/conversation-surface"]?.sourceRelease).toBe("0.1.1");
});
it("naturally reports managed when the manually merged bytes exactly match the target", async () => {
  const f = await fixture();
  const official = f.plugin.loadedFiles.find(file => file.target.endsWith("index.tsx"))!;
  await writeFile(f.filename, official.content);
  await f.service.adopt(f.root, f.plan.id);
  expect((await f.service.inspect(f.root)).plugins.find(plugin => plugin.pluginId === "conversation-surface")?.status).toBe("managed");
});
