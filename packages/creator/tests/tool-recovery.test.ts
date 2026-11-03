import { afterEach, expect, it, vi } from "vitest";
import { logicalProjectPath } from "../src/agent/project-read.js";
import { readDenied, ToolRecovery, toolReadIdentity } from "../src/agent/tool-recovery.js";
import { inspectRuntime, recordRuntimeEvidence } from "../src/agent/runtime-evidence.js";
import type { ToolContext } from "../src/agent/tools.js";
import { runtimeObservationNavigation } from "../src/agent/inspection.js";

const fixture = vi.hoisted(() => ({ hash: "a".repeat(64) }));
vi.mock("../src/agent/operator.js", () => ({ requestOperator: async () => ({ appUIModel: { hash: fixture.hash,
  layout: { type: "sidebar", nodeRef: "l0", items: [{ id: "history", child: { type: "slot", nodeRef: "l1" } }], content: { type: "slot", nodeRef: "l2" } } },
  pluginInstances: [{ id: "history", runtimeInstanceId: "internal-history", target: { type: "layout_slot", slotRef: "l1" } }] }) }));
function context() {
  return { root: "/unused", threadId: "thread", signal: new AbortController().signal,
    verificationMode: "static_and_runtime", diagnostics: new Map(),
    activity: { revision: 0, log: vi.fn(async () => {}) } } as unknown as ToolContext;
}
function report(ctx: ToolContext, observationRequestId?: string, observedAt = new Date().toISOString(), threadId = ctx.threadId, appUIModelHash = fixture.hash) {
  recordRuntimeEvidence(ctx.diagnostics, { threadId, ...(observationRequestId ? { observationRequestId } : {}),
    composition: { appUIModelHash, observedAt, instances: [], slots: [],
      layoutNodes: [{ nodeId: "layout-node:root", rect: { x: 0, y: 0, width: 900, height: 600 } }] } });
}
afterEach(() => vi.useRealTimers());

it.each(["/node_modules/a/index.d.ts", "/NODE_MODULES/a", "/dist/a", "/.env.local", "/.agent-ui/creator/logs", "C:/project/src/x.ts", "C:\\project\\src\\x.ts", "../outside", "\\\\server\\share"])("keeps denied path %s denied with recovery", path => {
  expect(() => logicalProjectPath(path)).toThrow("TOOL_PERMISSION_DENIED");
  try { logicalProjectPath(path); } catch (error: any) {
    expect(error.recovery).toMatchObject({ retryable: false, action: "use_allowed_read_entry" });
  }
});
it("recognizes repeated protected-area failures across changing file tools and unrelated searches", () => {
  const tracker = new ToolRecovery();
  expect(tracker.failure(readDenied("protected_project_area", "node_modules"))).toMatchObject({ attempts: 1 });
  tracker.search("grep", { path: "/src", pattern: "anything" }, ["file"], 0);
  expect(tracker.failure(readDenied("protected_project_area", "node_modules"))).toMatchObject({ attempts: 2, repeatedFailure: true });
  expect(tracker.takeGuidance()).toBeDefined(); expect(tracker.takeGuidance()).toBeUndefined();
  expect(tracker.failure(readDenied("protected_project_area", ".git"))).toMatchObject({ attempts: 1 });
});
it("detects empty searches with changing keywords, permits fresh evidence and omits content from logs", () => {
  const tracker = new ToolRecovery();
  for (let i = 0; i < 3; i++) expect(tracker.search("grep", { pattern: String(i), path: "/src" }, [], 0)).toBeUndefined();
  expect(tracker.search("glob", { pattern: "*.d.ts", path: "/src" }, [], 0)).toMatchObject({ action: "change_evidence_route" });
  tracker.search("grep", { path: "/src" }, ["found"], 0);
  expect(tracker.search("grep", { pattern: "new", path: "/src" }, [], 0)).toBeUndefined();
  expect(toolReadIdentity("read_file", { file_path: "/src/x.ts", content: "secret" })).toEqual({ file_path: "/src/x.ts" });
});
it("identifies mismatched references separately from aged observations and gives current recovery values", async () => {
  const ctx = context(); ctx.requestRuntimeObservation = vi.fn();
  await expect(inspectRuntime(ctx, { nodeRefs: ["layout-node:root"], instanceIds: ["missing"] })).rejects.toMatchObject({
    code: "CREATOR_RUNTIME_LAYOUT_REFERENCE_STALE", details: { invalidNodeRefs: ["layout-node:root"], invalidInstanceIds: ["missing"], validNodeRefs: expect.arrayContaining(["l0", "l1", "l2"]) },
    recovery: { action: "refresh_composition_references", retryable: false },
  });
  expect(ctx.requestRuntimeObservation).not.toHaveBeenCalled();
});
it("requests and awaits newly collected correlated geometry", async () => {
  const ctx = context(); report(ctx, undefined, new Date(Date.now() - 120_000).toISOString());
  ctx.requestRuntimeObservation = async ({ requestId }) => { report(ctx, requestId); };
  const result = await inspectRuntime(ctx, { nodeRefs: ["l0"], refresh: true });
  expect(result).toMatchObject({ runtimeStatus: "available", observationRefresh: { status: "received" }, layoutNodes: [{ nodeRef: "l0" }] });
});
it("shares one bounded capture between concurrent observations of the same revision", async () => {
  const ctx = context();
  ctx.requestRuntimeObservation = vi.fn(async ({ requestId }) => { await new Promise(resolve => setTimeout(resolve, 10)); report(ctx, requestId); });
  const results = await Promise.all([inspectRuntime(ctx, { refresh: true }), inspectRuntime(ctx, { refresh: true })]);
  expect(ctx.requestRuntimeObservation).toHaveBeenCalledTimes(1);
  expect(results.every(result => result.observationRefresh.status === "received")).toBe(true);
});
it("recognizes unchanged file ranges despite changing read offsets and unrelated successful reads", () => {
  const tracker = new ToolRecovery();
  expect(tracker.file("/wrapper.ts", "hash", 0, 30, 0)).toBeUndefined();
  expect(tracker.file("/wrapper.ts", "hash", 1, 20, 0)).toBeUndefined();
  tracker.file("/other.ts", "other", 0, 10, 0);
  expect(tracker.file("/wrapper.ts", "hash", 2, 30, 0)).toMatchObject({ action: "reuse_observed_file" });
  expect(tracker.takeGuidance()).toBeDefined();
  expect(tracker.file("/wrapper.ts", "changed", 0, 30, 0)).toBeUndefined();
  expect(tracker.file("/wrapper.ts", "hash", 0, 30, 1)).toBeUndefined();
});
it("makes live layout inspection discoverable and changes a framework tracing route without forbidding source reads", () => {
  expect(runtimeObservationNavigation({ appUIModel: { layout: { nodeRef: "l0" } } })).toMatchObject({ tool: "inspect_runtime_layout", input: { nodeRefs: ["l0"] }, toolGroup: "debugging" });
  const tracker = new ToolRecovery();
  expect(tracker.file("/src/runtime/a.ts", "a", 0, 10, 0, true)).toBeUndefined();
  tracker.file("/src/other.ts", "other", 0, 10, 0, true);
  expect(tracker.file("/src/framework/b.ts", "b", 0, 10, 0, true)).toBeUndefined();
  expect(tracker.file("/src/runtime/c.ts", "c", 0, 10, 0, true)).toMatchObject({ action: "observe_rendered_layout_if_needed", tool: "inspect_runtime_layout" });
  expect(tracker.takeGuidance()).toBeDefined();
  expect(tracker.file("/src/runtime/d.ts", "d", 0, 10, 0, true)).toBeUndefined();
  expect(tracker.file("/src/runtime/a.ts", "a", 0, 10, 1, true)).toBeUndefined();
});
it("maps persistent runtime identities to the current authoring refs before filtering or returning targets", async () => {
  const ctx = context();
  recordRuntimeEvidence(ctx.diagnostics, { threadId: ctx.threadId, composition: { appUIModelHash: fixture.hash,
    observedAt: new Date().toISOString(), slots: [], layoutNodes: [],
    instances: [{ instanceId: "internal-history", pluginId: "history-plugin", rect: { x: 0, y: 0, width: 280, height: 600 } }] } });
  expect(await inspectRuntime(ctx, { instanceIds: ["history"] })).toMatchObject({ runtimeStatus: "available",
    instances: [{ instanceId: "history", target: { type: "layout_slot", slotRef: "l1" } }] });
  expect(await inspectRuntime(ctx, { instanceIds: '["history"]' })).toMatchObject({ filterEncodingNormalized: true, instances: [{ instanceId: "history" }] });
  await expect(inspectRuntime(ctx, { instanceIds: '["outside"]' })).rejects.toMatchObject({ code: "CREATOR_RUNTIME_LAYOUT_REFERENCE_STALE" });
  await expect(inspectRuntime(ctx, { instanceIds: '[{"selector":"body"}]' })).rejects.toMatchObject({ code: "CREATOR_RUNTIME_LAYOUT_FILTER_INVALID" });
});
it("does not accept cached, wrong-thread, wrong-hash or unrelated captures as a requested refresh", async () => {
  vi.useFakeTimers(); const ctx = context(); report(ctx);
  ctx.requestRuntimeObservation = async ({ requestId }) => {
    report(ctx, requestId, new Date().toISOString(), "other");
    report(ctx, requestId, new Date().toISOString(), ctx.threadId, "b".repeat(64));
    report(ctx, "unrelated");
  };
  const pending = inspectRuntime(ctx, { refresh: true });
  await vi.advanceTimersByTimeAsync(3100);
  expect(await pending).toMatchObject({ runtimeStatus: "stale", observationRefresh: { status: "timeout" }, recovery: { retryable: false } });
});
it("cancels an observation wait promptly", async () => {
  const ctx = context(), controller = new AbortController(); ctx.signal = controller.signal;
  ctx.requestRuntimeObservation = async () => { controller.abort(); };
  await expect(inspectRuntime(ctx, { refresh: true })).rejects.toThrow();
});
