import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Annotation, Command, END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { prepareCompositionApplications } from "../src/agent/plugin-applications.js";
import { RunActivity } from "../src/agent/activity.js";
import { defaultAgentMessages } from "../src/agent/messages.js";
import type { ToolContext } from "../src/agent/tools.js";

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "creator application 确认-")); roots.push(root);
  const host = path.join(repository, "examples/creator-host-sandbox");
  await mkdir(path.join(root, ".agent-ui")); await mkdir(path.join(root, "src/ui"), { recursive: true });
  await writeFile(path.join(root, "package.json"), await readFile(path.join(host, "package.json")));
  await symlink(path.join(host, "node_modules"), path.join(root, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  await writeFile(path.join(root, ".agent-ui/project.json"), JSON.stringify({ mode: "platform", sourceRoot: "src/ui" }));
  await writeFile(path.join(root, "src/ui/app-ui.json"), '{"root":{"type":"slot","plugins":[]}}');
  const signal = new AbortController().signal;
  const context: ToolContext = { root, threadId: "application", skills: "", contracts: "", signal,
    readOnly: false, userMessage: "增加主题切换控件", groups: new Set(), authorizedPlugins: new Set(), approvedServices: new Set(),
    diagnostics: new Map(), verificationMode: "static_only", messages: defaultAgentMessages, activity: new RunActivity(root, "application", signal) };
  const State = Annotation.Root({ status: Annotation<string>() });
  const graph = new StateGraph(State).addNode("prepare", async () => {
    const result = await prepareCompositionApplications(context, { operations: [{ type: "insert_plugin", plugin: { pluginId: "theme-switch" } }] });
    return { status: result ? "declined" : "ready" };
  }).addEdge(START, "prepare").addEdge("prepare", END).compile({ checkpointer: new MemorySaver() });
  const config = { configurable: { thread_id: "application" } };
  const entry = path.join(root, "src/ui/plugins/theme-switch/index.tsx");
  await graph.invoke({ status: "pending" }, config);
  const pending = await graph.getState(config);
  const step = (pending.tasks[0]?.interrupts?.[0]?.value as { steps: any[] } | undefined)?.steps[0];
  expect(step?.question).toContain("theme-switch");
  expect(step?.description).toContain("src/ui/plugins/theme-switch/index.tsx");
  await expect(readFile(entry)).rejects.toMatchObject({ code: "ENOENT" });
  expect(context.activity.revision).toBe(0);
  return { root, graph, config, context, entry, step };
}

it("creates the installed-version application and Host service binding only after confirmation, with a recoverable receipt", async () => {
  const f = await fixture();
  const result = await f.graph.invoke(new Command({ resume: { answers: { [f.step.id]: ["approve"] } } }), f.config);
  expect(result.status).toBe("ready");
  expect(await readFile(f.entry, "utf8")).toContain("usePluginService");
  expect(await readFile(f.entry, "utf8")).toContain("service={service}");
  const receipt = await f.context.activity.persist();
  expect(receipt.files.some(file => file.path === "src/ui/plugins/theme-switch/index.tsx")).toBe(true);
  expect(receipt.transaction.undoable).toBe(true);
  expect(receipt.files.every(file => !file.path.includes("/source/") && !file.path.includes("/vendor/") && !file.path.includes("/upstream/"))).toBe(true);
  expect(await readFile(path.join(f.root, "src/ui/app-ui.json"), "utf8")).toBe('{"root":{"type":"slot","plugins":[]}}');
  // An already prepared application must not ask for confirmation again.
  await expect(prepareCompositionApplications(f.context, { operations: [{ type: "insert_plugin", plugin: { pluginId: "theme-switch" } }] })).resolves.toBeUndefined();
}, 30000);

it("declining creates no application files and ends the mutation request", async () => {
  const f = await fixture();
  expect((await f.graph.invoke(new Command({ resume: { answers: { [f.step.id]: ["decline"] } } }), f.config)).status).toBe("declined");
  await expect(readFile(f.entry)).rejects.toMatchObject({ code: "ENOENT" });
  expect(f.context.executionDecision?.status).toBe("user_cancelled");
  expect(f.context.activity.revision).toBe(0);
});

it("rejects confirmation against a changed project instead of adopting a fresh plan silently", async () => {
  const f = await fixture();
  await writeFile(path.join(f.root, "src/ui/app-ui.json"), '{"root":{"type":"column","children":[]}}');
  await expect(f.graph.invoke(new Command({ resume: { answers: { [f.step.id]: ["approve"] } } }), f.config)).rejects.toThrow("PLUGIN_ENABLEMENT_PREPARATION_STALE");
  await expect(readFile(f.entry)).rejects.toMatchObject({ code: "ENOENT" });
  expect(f.context.activity.revision).toBe(0);
});

it("requires separate preparations for multiple missing applications before creating either one", async () => {
  const f = await fixture();
  await expect(prepareCompositionApplications(f.context, { operations: [
    { type: "insert_plugin", plugin: { pluginId: "theme-switch" } },
    { type: "insert_plugin", plugin: { pluginId: "locale-switch" } },
  ] })).rejects.toThrow("PLUGIN_APPLICATION_PREPARATION_BATCH_REQUIRED");
  await expect(readFile(f.entry)).rejects.toMatchObject({ code: "ENOENT" });
  await expect(readFile(path.join(f.root, "src/ui/plugins/locale-switch/index.tsx"))).rejects.toMatchObject({ code: "ENOENT" });
  expect(f.context.activity.revision).toBe(0);
});
