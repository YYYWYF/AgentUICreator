// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MessagePrimitive, ThreadPrimitive, useAui, type AssistantRuntime } from "@assistant-ui/react";
import { HttpAgent } from "@ag-ui/client";
import type { RunAgentInput } from "@ag-ui/core";
import { ConversationRuntimeProvider, type ConversationThreadBinding } from "@agent-ui/runtime-conversation";
import { JSONGenerativeUI, defaultGenerativeUILibrary, createActionRegistry } from "@assistant-ui/react-generative-ui";
import { afterEach, describe, expect, it } from "vitest";
import { A2uiConversationIntegration } from "../../../packages/source-registry/registry/items/integration-a2ui/files/integrations/a2ui/A2uiConversationIntegration";
import { createA2uiConversationToolkit } from "../../../packages/source-registry/registry/items/integration-a2ui/files/integrations/a2ui/create-a2ui-toolkit";
import { a2uiOrderSnapshot } from "../../../packages/mock-agent/src/builtins/a2ui-interactive-order";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const disposers: (() => Promise<void>)[] = [];
afterEach(async () => { for (const dispose of disposers.splice(0)) await dispose(); });
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));
async function until(predicate: () => boolean) {
  for (let n = 0; n < 100; n++) { if (predicate()) return; await tick(); }
  throw new Error("Timed out waiting for A2UI integration");
}
function Message() { return <MessagePrimitive.Root><MessagePrimitive.Parts /></MessagePrimitive.Root>; }

async function fixture() {
  let currentId = "A";
  const binding: ConversationThreadBinding = {
    getThreadId: () => currentId,
    activateThread: id => { currentId = id; },
    subscribe: () => () => {},
    createNewThread: async () => crypto.randomUUID(),
    loadThread: async () => ({ messages: [] }),
    getThreadListSnapshot: () => ({ threads: [{ id: "A", status: "regular" }, { id: "B", status: "regular" }], archivedThreads: [] }),
  };
  const inputs: RunAgentInput[] = [];
  const streams: { emit(event: Record<string, unknown>): void; close(): void }[] = [];
  let active = 0;
  let maxActive = 0;
  let runtime!: AssistantRuntime;
  function Capture() { runtime = useAui().threads.__internal_getAssistantRuntime!(); return null; }
  const container = document.createElement("div"); document.body.append(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(<ConversationRuntimeProvider endpoint="http://example.test/a2ui" threadBinding={binding}
      toolkit={{ existing: { type: "backend", display: "standalone", render: () => <div data-existing-tool-ui="" /> } }}
      unstable_agentFactory={({ threadId }) => new HttpAgent({ threadId, url: "http://example.test/a2ui",
        fetch: async (_url, init) => {
          const input = JSON.parse(String(init.body)) as RunAgentInput;
          inputs.push(input); active++; maxActive = Math.max(maxActive, active);
          const encoder = new TextEncoder();
          let controller!: ReadableStreamDefaultController<Uint8Array>;
          const body = new ReadableStream<Uint8Array>({ start(next) { controller = next; } });
          let closed = false;
          const stream = {
            emit(event: Record<string, unknown>) { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); },
            close() { if (!closed) { closed = true; active--; controller.close(); } },
          };
          streams.push(stream);
          stream.emit({ type: "RUN_STARTED", threadId: input.threadId, runId: input.runId });
          return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
        },
      })}>
      <A2uiConversationIntegration><Capture /><ThreadPrimitive.Messages components={{ Message }} /></A2uiConversationIntegration>
    </ConversationRuntimeProvider>);
    await tick();
  });
  disposers.push(async () => { await act(async () => { streams.forEach(stream => stream.close()); await tick(); root.unmount(); }); container.remove(); });
  const parts = () => runtime.thread.getState().messages.flatMap(message => message.content).filter(part => part.type === "tool-call" && part.toolName === "present");
  return {
    inputs, streams, runtime, container, parts,
    get maxActive() { return maxActive; },
    async start() {
      await act(async () => {
        runtime.thread.append({ role: "user", content: [{ type: "text", text: "Review order" }], startRun: true });
        await until(() => streams.length === 1);
      });
    },
    async snapshot(status: "review" | "confirmed" | "cancelled" = "review") {
      const step = a2uiOrderSnapshot(status);
      if (step.type !== "activity-snapshot") throw new Error("Expected activity snapshot");
      await act(async () => { streams[0]!.emit({ ...step, type: "ACTIVITY_SNAPSHOT" }); await tick(); });
      await act(async () => { await until(() => container.querySelector('[data-aui="card"]') !== null); });
    },
    async finish(index = 0, close = true) {
      const input = inputs[index]!;
      await act(async () => {
        streams[index]!.emit({ type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId });
        if (close) streams[index]!.close();
        await tick();
      });
    },
    async clickConfirm() {
      const button = [...container.querySelectorAll("button")].find(button => button.textContent === "Confirm");
      expect(button).toBeDefined();
      await act(async () => { button!.click(); await tick(); });
    },
  };
}

describe("A2UI Official Integration (active native runtime)", () => {
  it("reuses upstream public APIs and registers only the backend renderer", () => {
    expect(JSONGenerativeUI).toBeTypeOf("function");
    expect(defaultGenerativeUILibrary).toBeDefined();
    expect(createActionRegistry).toBeTypeOf("function");
    const toolkit = createA2uiConversationToolkit({ sendAction() {} });
    expect(Object.keys(toolkit.present!).sort()).toEqual(["display", "render", "type"]);
    expect(toolkit.present!.type).toBe("backend");
  });
  it("renders a standard surface without adding a model-visible present tool", async () => {
    const f = await fixture(); await f.start(); await f.snapshot(); await f.finish();
    expect(f.parts()).toEqual([expect.objectContaining({ toolName: "present", toolCallId: "a2ui:order", result: {} })]);
    expect(f.container.querySelectorAll('[data-aui="card"]')).toHaveLength(1);
    expect(f.container.textContent).toContain("Developer Plan");
    expect(f.inputs[0]!.tools.some(tool => tool.name === "present")).toBe(false);
    expect(f.inputs[0]!.tools).toEqual([]);
  });
  it("preserves an existing parent Tool renderer alongside A2UI", async () => {
    const f = await fixture(); await f.start(); await f.snapshot();
    await act(async () => {
      f.streams[0]!.emit({ type: "TOOL_CALL_START", toolCallId: "existing-call", toolCallName: "existing" });
      f.streams[0]!.emit({ type: "TOOL_CALL_ARGS", toolCallId: "existing-call", delta: "{}" });
      f.streams[0]!.emit({ type: "TOOL_CALL_END", toolCallId: "existing-call" });
      f.streams[0]!.emit({ type: "TOOL_CALL_RESULT", messageId: "receipt", toolCallId: "existing-call", role: "tool", content: "{}" });
      await tick();
    });
    expect(f.container.querySelector("[data-existing-tool-ui]")).not.toBeNull();
    expect(f.container.querySelector('[data-aui="card"]')).not.toBeNull();
    await f.finish();
  });
  it("updates the same message/surface in place and delegates deleteSurface to upstream", async () => {
    const f = await fixture(); await f.start(); await f.snapshot(); await f.snapshot("confirmed");
    expect(f.parts()).toHaveLength(1);
    expect(f.container.querySelectorAll('[data-aui="card"]')).toHaveLength(1);
    expect(f.container.textContent).toContain("Order confirmed");
    expect(f.container.textContent).not.toContain("Developer Plan");
    await act(async () => {
      f.streams[0]!.emit({ type: "ACTIVITY_SNAPSHOT", messageId: "a2ui-order-message", activityType: "a2ui-surface", replace: true,
        content: { a2ui_operations: [{ version: "v0.9", deleteSurface: { surfaceId: "order" } }] } });
      await until(() => f.container.querySelector('[data-aui="card"]') === null);
    });
    expect(f.parts()).toHaveLength(0); await f.finish();
  });
  it("sends a native action continuation with no new user message, resume or synthetic tool result", async () => {
    const f = await fixture(); await f.start(); await f.snapshot(); await f.finish(); await f.clickConfirm();
    await act(async () => { await until(() => f.inputs.length === 2); });
    const next = f.inputs[1]!;
    expect(next.messages.filter(message => message.role === "user")).toEqual(f.inputs[0]!.messages.filter(message => message.role === "user"));
    expect(next.messages.some(message => message.role === "tool")).toBe(false);
    expect(next.messages.some(message => message.role === "assistant" && message.toolCalls?.some(call => call.id.startsWith("a2ui:")))).toBe(false);
    expect(next.resume).toBeUndefined();
    expect(next.tools).toEqual(f.inputs[0]!.tools);
    const action = next.forwardedProps.a2uiAction.userAction;
    expect(action).toMatchObject({ name: "confirm_order", surfaceId: "order", sourceComponentId: "confirm", timestamp: expect.any(String) });
    expect(action.type).toBeUndefined(); await f.finish(1);
  });
  it("defers an action while the original SSE body is still draining", async () => {
    const f = await fixture(); await f.start(); await f.snapshot(); await f.finish(0, false); await f.clickConfirm();
    expect(f.inputs).toHaveLength(1);
    await act(async () => { f.streams[0]!.close(); await until(() => f.inputs.length === 2); });
    expect(f.maxActive).toBe(1); await f.finish(1);
  });
  it("preserves the live surface on an in-memory thread revisit without executing or sending anything", async () => {
    const f = await fixture(); await f.start(); await f.snapshot(); await f.finish();
    await act(async () => { await f.runtime.threads.switchToThread("B"); await tick(); });
    expect(f.container.querySelector('[data-aui="card"]')).toBeNull();
    await act(async () => { await f.runtime.threads.switchToThread("A"); await tick(); });
    expect(f.container.querySelectorAll('[data-aui="card"]')).toHaveLength(1);
    expect(f.inputs).toHaveLength(1);
    expect(f.parts()).toHaveLength(1);
  });
});
