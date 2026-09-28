// @vitest-environment node
import { generatedProjectFixture } from "../support/generated-project";
import { randomUUID } from "node:crypto";
import { fork, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { minVersion } from "semver";
import { afterEach, expect, it, vi } from "vitest";
import { loadAgentUISourceRegistry, resolveAgentUISourceItemClosure } from "@agent-ui/source-registry";
import { applyAgentUISourceProjectMutation, removeAgentUISourceProjectMutation, recoverPendingAgentUISourceProjectMutation } from "../../src/project/source-registry/project-mutation";
import { applyAgentUISourceItem } from "../../src/project/source-registry/installer";
import { inspectAgentUISources } from "../../src/project/source-registry/inspector";
import { resourcePaths } from "../../src/project/optional-resource-paths";
import { inspectScenarioResources } from "../../src/project/install-scenario-resources";
import { installOptionalAgentUIResource } from "../../src/project/install-optional-agent-ui-resource";
import { handleUIProjectControlRequest } from "../../src/handler";
import { verifyUIProject } from "../../src/verify-ui";

// Internal seam: mocks delegate to the real writers and throw only after their
// actual writes. No failure switches are part of the public mutation API.
const failure = vi.hoisted(() => ({ stage: "" }));
const journalRace = vi.hoisted(() => ({ ownerPid: 0, remaining: 0, attempts: 0 }));
vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, link: async (...args: Parameters<typeof actual.link>) => {
    if (String(args[1]).endsWith("source-project-transaction.json")) {
      journalRace.attempts += 1;
      if (journalRace.remaining > 0) {
        journalRace.remaining -= 1;
        // Publish a competing transaction between admission and exclusive link.
        const journal = JSON.parse(await actual.readFile(args[0], "utf8"));
        await actual.writeFile(args[1], JSON.stringify({ ...journal, transactionId: randomUUID(), ownerPid: journalRace.ownerPid }));
      }
    }
    return actual.link(...args);
  } };
});
vi.mock("../../src/generate-plugin-registry", async importOriginal => {
  const actual = await importOriginal<typeof import("../../src/generate-plugin-registry")>();
  return { ...actual, writeGeneratedPluginRegistry: async (...args: Parameters<typeof actual.writeGeneratedPluginRegistry>) => {
    if (failure.stage === "source") throw new Error("Injected failure after Source commit");
    const result = await actual.writeGeneratedPluginRegistry(...args);
    if (failure.stage === "rollback") {
      await rm(path.join(args[0], result.path));
      await mkdir(path.join(args[0], result.path));
      throw new Error("Injected failure with blocked rollback");
    }
    if (failure.stage === "plugin") throw new Error("Injected plugin failure");
    return result;
  } };
});
vi.mock("../../src/generate-frontend-tool-registry", async importOriginal => {
  const actual = await importOriginal<typeof import("../../src/generate-frontend-tool-registry")>();
  return { ...actual, writeGeneratedFrontendToolRegistries: async (...args: Parameters<typeof actual.writeGeneratedFrontendToolRegistries>) => {
    const result = await actual.writeGeneratedFrontendToolRegistries(...args);
    if (failure.stage === "tools") throw new Error("Injected tools failure");
    return result;
  } };
});
vi.mock("../../src/generate-conversation-integration-registry", async importOriginal => {
  const actual = await importOriginal<typeof import("../../src/generate-conversation-integration-registry")>();
  return { ...actual, writeGeneratedConversationIntegrationRegistry: async (...args: Parameters<typeof actual.writeGeneratedConversationIntegrationRegistry>) => {
    const result = await actual.writeGeneratedConversationIntegrationRegistry(...args);
    if (failure.stage === "integrations") throw new Error("Injected integration failure");
    return result;
  } };
});
vi.mock("../../src/verify-ui", async importOriginal => {
  const actual = await importOriginal<typeof import("../../src/verify-ui")>();
  return { ...actual, verifyUIProject: async (...args: Parameters<typeof actual.verifyUIProject>) => {
    const result = await actual.verifyUIProject(...args);
    if (failure.stage === "warnings") return { ...result, warnings: [...result.warnings, { code: "injected-warning", message: "Warning only" }] };
    if (failure.stage === "verify") return { ...result, status: "failed" as const, errors: [{ code: "injected", message: "Injected verification failure" }] };
    return result;
  } };
});
const roots: string[] = [];
const children: ChildProcess[] = [];
afterEach(async () => {
  failure.stage = ""; journalRace.remaining = 0; journalRace.attempts = 0; journalRace.ownerPid = 0;
  vi.restoreAllMocks();
  await Promise.all(children.splice(0).map(async child => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit"); child.kill(); await exited;
    }
  }));
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
const generated = ["plugins/registry.generated.ts", "agent-contract/frontend-tools.generated.ts", "agent-ui/conversation/frontend-tool-uis.generated.ts", "agent-ui/conversation/integrations.generated.tsx"];
async function fixture(itemId = "integration/a2ui", legacy = false) {
  const root = await mkdtemp(path.join(tmpdir(), "source-project-")); roots.push(root);
  const sourceRoot = legacy ? root : path.join(root, "custom-ui");
  await mkdir(path.join(root, ".agent-ui"));
  await writeFile(path.join(root, ".agent-ui/project.json"), JSON.stringify(legacy ? { version: "1", mode: "platform" } : { version: "2", mode: "platform", sourceRoot: "custom-ui" }));
  const registry = await loadAgentUISourceRegistry();
  const closure = resolveAgentUISourceItemClosure(registry, itemId);
  const dependencies = Object.assign({}, ...closure.map(item => item.packages ?? {})) as Record<string, string>;
  await writeFile(path.join(root, "package.json"), JSON.stringify({ dependencies }));
  for (const [name, required] of Object.entries(dependencies)) {
    const directory = path.join(root, "node_modules", name); await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "package.json"), JSON.stringify({ name, version: minVersion(required)!.version }));
  }
  const seededFoundation = legacy
    ? closure.filter(item => item.kind === "foundation")
    : resolveAgentUISourceItemClosure(registry, "foundation/core")
      .filter(item => item.kind === "foundation" && !closure.some(selected => selected.id === item.id));
  for (const file of seededFoundation.flatMap(item => item.loadedFiles)) {
    const target = path.join(sourceRoot, file.target); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, file.content);
  }
  const modelPath = path.join(sourceRoot, "app-ui/app-ui.json");
  await mkdir(path.dirname(modelPath), { recursive: true });
  await writeFile(modelPath, JSON.stringify({ root: { type: "slot", plugins: [] } }));
  await mkdir(path.join(sourceRoot, "plugins"), { recursive: true });
  const { config } = await resourcePaths(root);
  return { root, sourceRoot, config, modelPath, closure, itemId };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function apply(f: Fixture) {
  return applyAgentUISourceProjectMutation(f.root, { itemId: f.itemId, expectedStateHash: (await inspectAgentUISources(f.root, f.config)).stateHash }, { config: f.config });
}
async function remove(f: Fixture, itemIds = [f.itemId]) {
  return removeAgentUISourceProjectMutation(f.root, { itemIds, expectedStateHash: (await inspectAgentUISources(f.root, f.config)).stateHash }, { config: f.config });
}
async function snapshot(f: Fixture) {
  const paths = [...new Set([...f.closure.flatMap(item => item.loadedFiles.map(file => path.join(f.sourceRoot, file.target))), ...generated.map(relative => path.join(f.sourceRoot, relative)), path.join(f.root, f.config.agentUI.metadataRoot, "source-lock.json"), f.modelPath])].sort();
  return Promise.all(paths.map(async filename => ({ path: path.relative(f.root, filename).split(path.sep).join("/"), beforeContentBase64: await readFile(filename).then(content => content.toString("base64"), error => { if (error.code === "ENOENT") return null; throw error; }) })));
}
const require = createRequire(import.meta.url);
async function exitedOwnerPid() {
  const child = spawn(process.execPath, ["-e", ""]); children.push(child);
  const exited = once(child, "exit");
  if (child.pid === undefined) throw new Error("Child process has no PID.");
  const pid = child.pid; await exited; return pid;
}
function journalPath(f: Fixture) { return path.join(f.root, f.config.agentUI.metadataRoot, "source-project-transaction.json"); }
async function writeOwnerJournal(f: Fixture, originals: Awaited<ReturnType<typeof snapshot>>, ownerPid: number) {
  await writeFile(journalPath(f), JSON.stringify({ schemaVersion: 2, transactionId: randomUUID(), ownerPid, createdAt: new Date().toISOString(),
    originals: originals.filter(entry => entry.path !== path.relative(f.root, f.modelPath)) }));
}
async function childMessage(child: ChildProcess, message: Record<string, unknown>) {
  const response = once(child, "message"); child.send!(message);
  const timer = setTimeout(() => child.kill(), 15_000);
  const [value] = await Promise.race([
    response,
    once(child, "exit").then(([code, signal]) => { throw new Error(`Child exited before replying: code=${code}, signal=${signal}`); }),
  ]).finally(() => clearTimeout(timer));
  if (value.type === "error") throw new Error(value.message);
  return value;
}
async function processControl(f: Fixture, operation: string, input: Record<string, unknown> = {}) {
  const child = fork(fileURLToPath(new URL("../fixtures/source-project-mutation/control.mts", import.meta.url)), [], {
    execArgv: ["--import", require.resolve("tsx")],
    env: { ...process.env, TSX_TSCONFIG_PATH: fileURLToPath(new URL("tsconfig.json", `file://${await generatedProjectFixture()}/`)) },
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  });
  children.push(child);
  return (await childMessage(child, { projectRoot: f.root, operation, input })).response;
}
it("Mock and ProjectControl install byte-identical V2 source and registries", async () => {
  const a = await fixture(); const b = await fixture();
  await installOptionalAgentUIResource(a.root, a.itemId);
  const result = await handleUIProjectControlRequest({ schemaVersion: 3, operation: "apply_agent_ui_source_item", input: { itemId: b.itemId, expectedStateHash: (await inspectAgentUISources(b.root, b.config)).stateHash } }, b.root);
  expect(result.ok).toBe(true);
  expect(await snapshot(a)).toEqual(await snapshot(b));
  expect((await verifyUIProject(b.root)).status).toBe("passed");
});
it.each([false, true])("installs A2UI and repairs stale generated output without changing composition (legacy=%s)", async legacy => {
  const f = await fixture("integration/a2ui", legacy); const model = await readFile(f.modelPath);
  const result = await apply(f);
  expect(result.changedPaths).toEqual([...new Set([...result.sourceChangedPaths, ...result.generatedChangedPaths])].sort());
  const sources = await inspectAgentUISources(f.root, f.config);
  for (const id of ["integration/a2ui", "integration/generative-ui", "agent-component/assistant-ui-generative-ui"]) expect(sources.items.find(item => item.id === id)).toMatchObject({ status: "managed", dependencyIssues: [] });
  const filename = path.join(f.sourceRoot, generated[3]!);
  expect(await readFile(filename, "utf8")).toContain('./integrations/a2ui');
  await writeFile(filename, "// stale\n");
  expect(await apply(f)).toMatchObject({ changed: true, sourceChangedPaths: [], generatedChangedPaths: [path.relative(f.root, filename)] });
  expect(await apply(f)).toMatchObject({ changed: false, changedPaths: [] });
  expect(await readFile(f.modelPath)).toEqual(model);
  if (legacy) expect(Object.keys(JSON.parse(await readFile(path.join(f.root, f.config.agentUI.metadataRoot, "source-lock.json"), "utf8")).items)).not.toContain("foundation/core-runtime");
});
it.each(["integration/a2ui", "demo/frontend-tool-form"])("removes %s and its generated imports", async itemId => {
  const f = await fixture(itemId); await apply(f);
  await remove(f);
  const inspected = await inspectAgentUISources(f.root, f.config);
  expect(inspected.items.find(item => item.id === itemId)?.status).toBe("not-installed");
  if (itemId === "integration/a2ui") expect(await readFile(path.join(f.sourceRoot, generated[3]!), "utf8")).not.toContain('./integrations/a2ui');
  else for (const relative of generated.slice(1, 3)) expect(await readFile(path.join(f.sourceRoot, relative), "utf8")).not.toContain("demo-form-tools");
  expect((await verifyUIProject(f.root)).status).toBe("passed");
});
it("installs Tool resources without inserting a Demo Plugin instance", async () => {
  const f = await fixture("demo/frontend-tool-form"); const before = await readFile(f.modelPath);
  await apply(f);
  for (const relative of generated.slice(1, 3)) expect(await readFile(path.join(f.sourceRoot, relative), "utf8")).toContain("demo-form-tools");
  expect(await readFile(f.modelPath)).toEqual(before);
});
it("rejects removal while a disabled AppUIModel instance still references an owned asset", async () => {
  const f = await fixture("demo/frontend-tool-form"); await apply(f);
  await writeFile(f.modelPath, JSON.stringify({ root: { type: "slot", plugins: [] }, applicationPlugins: [{ id: "form-instance", pluginId: "frontend-tool-form-demo", enabled: false }] }));
  const before = await snapshot(f);
  await expect(remove(f)).rejects.toMatchObject({ code: "AGENT_UI_SOURCE_COMPOSITION_IN_USE", details: { pluginIds: ["frontend-tool-form-demo"], instanceIds: ["form-instance"] } });
  expect(await snapshot(f)).toEqual(before);
});
it("rejects removal of a dependency before any project write", async () => {
  const f = await fixture(); await apply(f); const before = await snapshot(f);
  await expect(remove(f, ["integration/generative-ui"])).rejects.toMatchObject({ code: "AGENT_UI_SOURCE_DEPENDENCY_IN_USE" });
  expect(await snapshot(f)).toEqual(before);
});
it.each(["source", "plugin", "tools", "integrations", "verify"])("rolls back source and all generated writes after %s failure", async stage => {
  const f = await fixture(); const before = await snapshot(f); failure.stage = stage;
  await expect(apply(f)).rejects.toThrow(); failure.stage = "";
  expect(await snapshot(f)).toEqual(before);
  await expect(readFile(path.join(f.root, f.config.agentUI.metadataRoot, "source-project-transaction.json"))).rejects.toMatchObject({ code: "ENOENT" });
  await apply(f); const installed = await snapshot(f); failure.stage = stage;
  await expect(remove(f)).rejects.toThrow(); failure.stage = "";
  expect(await snapshot(f)).toEqual(installed);
});
it.each(["recover", "inspect", "apply", "remove"].flatMap(next => ["source", "generated"].map(stage => [next, stage] as const)))("recovers before %s after a %s crash", async (next, stage) => {
  const f = await fixture(); const before = await snapshot(f);
  if (stage === "source") await applyAgentUISourceItem(f.root, { itemId: f.itemId, expectedStateHash: (await inspectAgentUISources(f.root, f.config)).stateHash }, f.config);
  else await apply(f);
  const journalPath = path.join(f.root, f.config.agentUI.metadataRoot, "source-project-transaction.json");
  await writeFile(journalPath, JSON.stringify({ schemaVersion: 1, originals: before.filter(entry => entry.path !== path.relative(f.root, f.modelPath)) }));
  if (next === "recover") await recoverPendingAgentUISourceProjectMutation(f.root, f.config);
  else if (next === "inspect") expect((await handleUIProjectControlRequest({ schemaVersion: 3, operation: "inspect_agent_ui_sources", input: {} }, f.root)).ok).toBe(true);
  else {
    const hash = (await inspectAgentUISources(f.root, f.config)).stateHash;
    await expect(next === "apply" ? applyAgentUISourceProjectMutation(f.root, { itemId: f.itemId, expectedStateHash: hash }, { config: f.config }) : removeAgentUISourceProjectMutation(f.root, { itemIds: [f.itemId], expectedStateHash: hash }, { config: f.config })).rejects.toMatchObject({ code: "AGENT_UI_SOURCE_STATE_CONFLICT" });
  }
  expect(await snapshot(f)).toEqual(before);
  await expect(readFile(journalPath)).rejects.toMatchObject({ code: "ENOENT" });
});
it("protects customized source without repairing registries around the admission failure", async () => {
  const f = await fixture(); await apply(f);
  const file = f.closure.find(item => item.id === f.itemId)!.loadedFiles[0]!;
  await writeFile(path.join(f.sourceRoot, file.target), Buffer.concat([file.content, Buffer.from("\n// customized\n")]));
  const before = await snapshot(f);
  await expect(apply(f)).rejects.toMatchObject({ code: "AGENT_UI_SOURCE_CUSTOMIZED" });
  expect(await snapshot(f)).toEqual(before);
});

it("commits verification warnings without rolling back", async () => {
  const f = await fixture(); failure.stage = "warnings";
  expect(await apply(f)).toMatchObject({ changed: true });
  expect((await inspectAgentUISources(f.root, f.config)).items.find(item => item.id === f.itemId)?.status).toBe("managed");
});

it("retains a retryable journal and both causes when rollback itself fails", async () => {
  const f = await fixture(); const before = await snapshot(f); failure.stage = "rollback";
  const journal = path.join(f.root, f.config.agentUI.metadataRoot, "source-project-transaction.json");
  await expect(apply(f)).rejects.toMatchObject({ code: "AGENT_UI_SOURCE_PROJECT_ROLLBACK_FAILED", details: {
    cause: "Injected failure with blocked rollback", rollbackCause: expect.any(String), journalPath: path.relative(f.root, journal),
  } });
  const retained = JSON.parse(await readFile(journal, "utf8"));
  expect(retained).toMatchObject({ schemaVersion: 2, ownerPid: process.pid, transactionId: expect.any(String), createdAt: expect.any(String) });
  failure.stage = "";
  await rm(path.join(f.sourceRoot, generated[0]!), { recursive: true });
  await expect(recoverPendingAgentUISourceProjectMutation(f.root, f.config)).rejects.toMatchObject({ code: "AGENT_UI_SOURCE_PROJECT_MUTATION_PENDING" });
  // Simulate the failed mutation owner exiting before the retrying Host starts.
  await writeFile(journal, JSON.stringify({ ...retained, ownerPid: await exitedOwnerPid() }));
  await recoverPendingAgentUISourceProjectMutation(f.root, f.config);
  expect(await snapshot(f)).toEqual(before);
});

it.each(["recover", "inspect", "mock", "apply", "remove"])("does not touch an active owner's journals or files during %s", async operation => {
  const f = await fixture(); const before = await snapshot(f); await apply(f);
  await writeOwnerJournal(f, before, process.pid);
  // Invalid low-level content proves active-owner rejection happens before even
  // parsing or attempting recovery of that transaction.
  const lowJournal = path.join(f.root, f.config.agentUI.metadataRoot, "source-transaction.json");
  await writeFile(lowJournal, "active low-level transaction");
  const active = await snapshot(f); const journal = await readFile(journalPath(f));
  if (operation === "inspect") expect(await handleUIProjectControlRequest({ schemaVersion: 3, operation: "inspect_agent_ui_sources", input: {} }, f.root)).toMatchObject({ ok: false, error: { code: "AGENT_UI_SOURCE_PROJECT_MUTATION_PENDING" } });
  else {
    const request = operation === "recover" ? recoverPendingAgentUISourceProjectMutation(f.root, f.config)
      : operation === "mock" ? inspectScenarioResources(f.root)
      : operation === "apply" ? apply(f) : remove(f);
    await expect(request).rejects.toMatchObject({ code: "AGENT_UI_SOURCE_PROJECT_MUTATION_PENDING" });
  }
  expect(await readFile(journalPath(f))).toEqual(journal);
  expect(await readFile(lowJournal, "utf8")).toBe("active low-level transaction");
  expect(await snapshot(f)).toEqual(active);
});
it("recovers a V2 journal only after its owner has exited", async () => {
  const f = await fixture(); const before = await snapshot(f); await apply(f);
  await writeOwnerJournal(f, before, await exitedOwnerPid());
  await recoverPendingAgentUISourceProjectMutation(f.root, f.config);
  expect(await snapshot(f)).toEqual(before);
  await expect(readFile(journalPath(f))).rejects.toMatchObject({ code: "ENOENT" });
});
it("treats EPERM as a living owner and preserves its transaction", async () => {
  const f = await fixture(); const before = await snapshot(f); await apply(f);
  await writeOwnerJournal(f, before, process.pid); const active = await snapshot(f);
  const journal = await readFile(journalPath(f));
  vi.spyOn(process, "kill").mockImplementation(() => { throw Object.assign(new Error("Not permitted"), { code: "EPERM" }); });
  await expect(recoverPendingAgentUISourceProjectMutation(f.root, f.config)).rejects.toMatchObject({ code: "AGENT_UI_SOURCE_PROJECT_MUTATION_PENDING" });
  expect(await snapshot(f)).toEqual(active); expect(await readFile(journalPath(f))).toEqual(journal);
});
it("propagates unexpected process liveness errors without recovering", async () => {
  const f = await fixture(); const before = await snapshot(f); await apply(f);
  await writeOwnerJournal(f, before, process.pid); const active = await snapshot(f);
  const error = Object.assign(new Error("Unexpected liveness failure"), { code: "EINVAL" });
  vi.spyOn(process, "kill").mockImplementation(() => { throw error; });
  await expect(recoverPendingAgentUISourceProjectMutation(f.root, f.config)).rejects.toBe(error);
  expect(await snapshot(f)).toEqual(active);
});
it.each([0, -1, 1.5])("rejects invalid owner PID %s before probing or restoring", async ownerPid => {
  const f = await fixture(); const before = await snapshot(f); await apply(f);
  await writeOwnerJournal(f, before, ownerPid); const active = await snapshot(f);
  const kill = vi.spyOn(process, "kill");
  await expect(recoverPendingAgentUISourceProjectMutation(f.root, f.config)).rejects.toThrow("Invalid Host source mutation owner");
  expect(kill).not.toHaveBeenCalled(); expect(await snapshot(f)).toEqual(active);
});
it("rechecks a living owner that wins the create-only journal race", async () => {
  const f = await fixture(); const before = await snapshot(f);
  journalRace.ownerPid = process.pid; journalRace.remaining = 1; journalRace.attempts = 0;
  await expect(apply(f)).rejects.toMatchObject({ code: "AGENT_UI_SOURCE_PROJECT_MUTATION_PENDING" });
  expect(journalRace.attempts).toBe(1); expect(await snapshot(f)).toEqual(before);
  expect(JSON.parse(await readFile(journalPath(f), "utf8"))).toMatchObject({ schemaVersion: 2, ownerPid: process.pid });
});
it("recovers a dead create-only winner and retries fresh admission once", async () => {
  const f = await fixture(); journalRace.ownerPid = await exitedOwnerPid(); journalRace.remaining = 1; journalRace.attempts = 0;
  expect(await apply(f)).toMatchObject({ changed: true });
  expect(journalRace.attempts).toBe(2);
  await expect(readFile(journalPath(f))).rejects.toMatchObject({ code: "ENOENT" });
});
it("bounds admission retries after repeated stale journal races", async () => {
  const f = await fixture(); const before = await snapshot(f);
  journalRace.ownerPid = await exitedOwnerPid(); journalRace.remaining = 2; journalRace.attempts = 0;
  await expect(apply(f)).rejects.toMatchObject({ code: "AGENT_UI_SOURCE_PROJECT_MUTATION_PENDING" });
  expect(journalRace.attempts).toBe(2); expect(await snapshot(f)).toEqual(before);
});
it("keeps another Node process's active mutation untouched and recovers after it exits", async () => {
  const f = await fixture(); const before = await snapshot(f); await apply(f);
  const owner = fork(fileURLToPath(new URL("../fixtures/source-project-mutation/owner.mjs", import.meta.url)), [], {
    execArgv: [], stdio: ["ignore", "ignore", "inherit", "ipc"],
  }); children.push(owner);
  const ready = await childMessage(owner, { type: "hold", journalPath: journalPath(f), originals: before.filter(entry => entry.path !== path.relative(f.root, f.modelPath)) });
  expect(ready.ownerPid).not.toBe(process.pid);
  const active = await snapshot(f); const journal = await readFile(journalPath(f));
  const hash = (await inspectAgentUISources(f.root, f.config)).stateHash;
  for (const [operation, input] of [
    ["inspect_agent_ui_sources", {}],
    ["apply_agent_ui_source_item", { itemId: f.itemId, expectedStateHash: hash }],
    ["remove_agent_ui_source_items", { itemIds: [f.itemId], expectedStateHash: hash }],
  ] as const) {
    expect(await processControl(f, operation, input)).toMatchObject({ ok: false, error: { code: "AGENT_UI_SOURCE_PROJECT_MUTATION_PENDING" } });
    expect(await snapshot(f)).toEqual(active); expect(await readFile(journalPath(f))).toEqual(journal);
  }
  const exited = once(owner, "exit"); owner.send!({ type: "exit" }); await exited;
  expect(await processControl(f, "inspect_agent_ui_sources")).toMatchObject({ ok: true });
  expect(await snapshot(f)).toEqual(before);
  await expect(readFile(journalPath(f))).rejects.toMatchObject({ code: "ENOENT" });
}, 30_000);

it("does not recover an unowned low-level journal without a Host journal", async () => {
  const f = await fixture(); const before = await snapshot(f);
  const lowJournal = path.join(f.root, f.config.agentUI.metadataRoot, "source-transaction.json");
  await writeFile(lowJournal, "another transaction may have just started");
  await recoverPendingAgentUISourceProjectMutation(f.root, f.config);
  expect(await readFile(lowJournal, "utf8")).toBe("another transaction may have just started");
  expect(await snapshot(f)).toEqual(before);
});
