import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useAui, type AssistantRuntime } from "@assistant-ui/react";
import type { RunAgentInput } from "@ag-ui/client";
import { describe, expect, it, vi } from "vitest";
import {
  AgentUIProvider, AgentUIConversationBinding, useAgent,
  ConversationRuntimeProvider, createEphemeralConversationThreadBinding,
  useConversationRuntimeBridge, createAgentUIFrontendTools,
  type AgentUIHost, type AgentUIContext, type AgentUISendOptions,
  type ConversationRuntimeProviderProps, type ConversationRuntimeBridge} from "../src/public.js";

async function until(predicate: () => boolean) {
  for (let i = 0; i < 150; i++) {
    if (predicate()) return;
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  }
  throw new Error("CTX_REQUEST_DID_NOT_SETTLE");
}

type Reply = (input: RunAgentInput, index: number) => Record<string, unknown>[];
async function fixture(ctx?: AgentUIContext, reply?: Reply) {
  const requests: RunAgentInput[] = [], urls: string[] = [];
  const errors = vi.fn();
  let host!: AgentUIHost, native!: AssistantRuntime, bridge!: ConversationRuntimeBridge;
  function Capture() {
    host = useAgent();
    native = useAui().threads.__internal_getAssistantRuntime!();
    bridge = useConversationRuntimeBridge();
    return <AgentUIConversationBinding />;
  }
  const binding = createEphemeralConversationThreadBinding();
  const tools = createAgentUIFrontendTools([{ name: "probe", description: "probe", inputSchema: { type: "object", properties: {} }, execute: async () => ({ ok: true }) }]);
  const fetch: NonNullable<ConversationRuntimeProviderProps["fetch"]> = async (url, init) => {
    const input = JSON.parse(String(init.body)) as RunAgentInput;
    requests.push(input); urls.push(url);
    const run = { threadId: input.threadId, runId: input.runId };
    const frames = reply?.(input, requests.length) ?? [];
    const terminal = frames.some(frame => frame.type === "RUN_FINISHED" || frame.type === "RUN_ERROR");
    const body = [ { type: "RUN_STARTED", ...run }, ...frames,
      ...(terminal ? [] : [{ type: "RUN_FINISHED", ...run, outcome: { type: "success" } }]) ];
    return new Response(body.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
  };
  const view = (ctx: AgentUIContext | undefined) => <AgentUIProvider>
    <ConversationRuntimeProvider endpoint="https://example.test/agent" ctx={ctx} fetch={fetch}
      threadBinding={binding} frontendTools={tools} onError={errors}
      getRunContext={() => [{ description: "independent", value: "context" }]}><Capture /></ConversationRuntimeProvider>
  </AgentUIProvider>;
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(view(ctx)); });
  await until(() => host?.getSnapshot().status === "ready" && !native.thread.getState().isLoading);
  async function settle(action: () => Promise<void>) {
    let sent!: Promise<void>;
    const count = requests.length;
    await act(async () => { sent = action(); void sent.catch(() => {}); });
    await until(() => requests.length > count && !native.thread.getState().isRunning);
    await sent;
  }
  return {
    requests, urls, errors, settle,
    get host() { return host; }, get native() { return native; }, get bridge() { return bridge; },
    send: (text: string, options?: AgentUISendOptions) => settle(() => host.sendMessage(text, options)),
    update: async (ctx?: AgentUIContext) => { await act(async () => tree.update(view(ctx))); },
    close: async () => { await act(async () => tree.unmount()); },
  };
}

describe("default and per-send forwardedProps.ctx", () => {
  it("shallowly merges defaults, preserves null and keeps context/config independent", async () => {
    const f = await fixture({ tenant: "one", scene: "default", nested: { a: 1, b: 2 }, list: [1, 2], cleared: "value" });
    try {
      await f.send("analyze", { endpoint: "https://example.test/workflow", ctx: { scene: "send", nested: { c: 3 }, list: [3], cleared: null } });
      expect(f.requests[0]!.forwardedProps).toEqual({ ctx: { tenant: "one", scene: "send", nested: { c: 3 }, list: [3], cleared: null } });
      expect(f.urls[0]).toBe("https://example.test/workflow");
      expect(f.requests[0]!.context).toEqual([{ description: "independent", value: "context" }]);
      expect(f.requests[0]!.messages).toMatchObject([{ role: "user", content: "analyze" }]);
      await f.send("next", { ctx: {} });
      expect(f.requests[1]!.forwardedProps.ctx.scene).toBe("default");
      expect(f.urls[1]).toBe("https://example.test/agent");
      expect(f.errors).not.toHaveBeenCalled();
    } finally { await f.close(); }
  });

  it("updates defaults without replacing the Thread and omits empty ctx", async () => {
    const f = await fixture({ version: 1 });
    try {
      await f.send("one");
      const id = f.requests[0]!.threadId;
      await f.update({ version: 2 });
      await f.send("two");
      await f.update({});
      await f.send("empty");
      await f.update();
      await f.send("removed");
      expect(f.requests.map(input => input.forwardedProps.ctx)).toEqual([{ version: 1 }, { version: 2 }, undefined, undefined]);
      expect(f.requests.every(input => input.threadId === id)).toBe(true);
      expect(f.native.thread.getState().messages.filter(message => message.role === "user")).toHaveLength(4);
    } finally { await f.close(); }
  });

  it("snapshots per-send ctx, restores it on retry and keeps message branches isolated", async () => {
    const f = await fixture({ tenant: "one" });
    try {
      const ctx = { order: { id: "first" } };
      const sending = f.send("first", { ctx });
      ctx.order.id = "mutated";
      await sending;
      // Retry an earlier user turn after visiting a different message branch.
      const firstUser = f.native.thread.getState().messages.find(message => message.role === "user")!;
      await f.send("second", { ctx: { order: { id: "second" } } });
      await f.settle(async () => { f.native.thread.startRun({ parentId: firstUser.id }); });
      expect(f.requests.at(-1)!.forwardedProps.ctx).toEqual({ tenant: "one", order: { id: "first" } });
      await f.send("fresh");
      expect(f.requests.at(-1)!.forwardedProps.ctx).toEqual({ tenant: "one" });
    } finally { await f.close(); }
  });

  it("retains overrides through a frontend-tool continuation", async () => {
    const f = await fixture({ tenant: "one" }, (_input, index) => index === 1 ? [
      { type: "TOOL_CALL_START", toolCallId: "probe-1", toolCallName: "probe", parentMessageId: "answer-1" },
      { type: "TOOL_CALL_ARGS", toolCallId: "probe-1", delta: "{}" },
      { type: "TOOL_CALL_END", toolCallId: "probe-1" },
    ] : []);
    try {
      await f.send("tool", { ctx: { order: "one" } });
      await until(() => f.requests.length === 2 && !f.native.thread.getState().isRunning);
      expect(f.requests.map(input => input.forwardedProps.ctx)).toEqual([{ tenant: "one", order: "one" }, { tenant: "one", order: "one" }]);
      expect(f.requests[1]!.messages).toMatchObject([{ role: "tool", toolCallId: "probe-1" }]);
      await f.send("fresh");
      expect(f.requests[2]!.forwardedProps.ctx).toEqual({ tenant: "one" });
    } finally { await f.close(); }
  });

  it("forwards Composer options without polluting the next draft", async () => {
    const f = await fixture({ tenant: "one" });
    try {
      await act(async () => f.native.thread.composer.setText("draft"));
      await f.settle(() => f.host.sendComposer({ ctx: { source: "composer" } }));
      expect(f.requests[0]!.forwardedProps.ctx).toEqual({ tenant: "one", source: "composer" });
      await act(async () => f.native.thread.composer.setText("next draft"));
      await f.settle(() => f.host.sendComposer());
      expect(f.requests[1]!.forwardedProps.ctx).toEqual({ tenant: "one" });
    } finally { await f.close(); }
  });

  it("uses fresh defaults and the original single-send snapshot on interrupt resume", async () => {
    const f = await fixture({ tenant: "before", order: "default" }, (input, index) => index === 1 ? [
      { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId,
        outcome: { type: "interrupt", interrupts: [{ id: "confirm", reason: "confirmation" }] } },
    ] : []);
    try {
      const ctx = { order: { id: "original" } };
      await f.send("approve", { ctx });
      ctx.order.id = "changed";
      await f.update({ tenant: "after", order: "new default" });
      await f.settle(() => f.host.resumeInterrupts([{ interruptId: "confirm", status: "resolved", payload: { approved: true } }]));
      expect(f.requests[1]!.forwardedProps.ctx).toEqual({ tenant: "after", order: { id: "original" } });
      expect(f.requests[1]!.messages).toEqual([]);
      expect(f.requests[1]!.resume).toEqual([{ interruptId: "confirm", status: "resolved", payload: { approved: true } }]);
      await f.send("fresh");
      expect(f.requests[2]!.forwardedProps.ctx).toEqual({ tenant: "after", order: "new default" });
    } finally { await f.close(); }
  });

  it("isolates an interrupted background Thread and other Agent providers", async () => {
    const f = await fixture({ tenant: "A" }, (input, index) => index === 1 ? [
      { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId,
        outcome: { type: "interrupt", interrupts: [{ id: "confirm", reason: "confirmation" }] } },
    ] : []);
    const other = await fixture({ tenant: "B" });
    try {
      await f.send("old", { ctx: { turn: "old" } });
      const oldId = f.requests[0]!.threadId;
      await act(async () => { await f.host.createThread(); });
      await f.send("new", { ctx: { turn: "new" } });
      const newId = f.requests[1]!.threadId;
      expect(newId).not.toBe(oldId);
      await f.settle(() => f.host.thread(oldId).resumeInterrupts([{ interruptId: "confirm", status: "resolved" }]));
      await until(() => f.requests.length === 3);
      expect(f.requests[2]!.threadId).toBe(oldId);
      expect(f.requests[2]!.forwardedProps.ctx).toEqual({ tenant: "A", turn: "old" });
      expect(f.host.getSnapshot().runtime?.conversation.id).toBe(newId);
      await f.settle(() => f.host.thread(newId).sendMessage("new thread fresh"));
      expect(f.requests[3]!.forwardedProps.ctx).toEqual({ tenant: "A" });
      await other.send("other");
      expect(other.requests[0]!.forwardedProps.ctx).toEqual({ tenant: "B" });
    } finally { await f.close(); await other.close(); }
  });

  it("does not leak overrides after a failed run", async () => {
    const f = await fixture({ tenant: "one" }, (_input, index) => index === 1 ? [
      { type: "RUN_ERROR", message: "probe failed", code: "PROBE_FAILED" },
    ] : []);
    try {
      await expect(f.send("fail", { ctx: { once: true } })).rejects.toThrow("probe failed");
      await f.send("fresh");
      expect(f.requests[1]!.forwardedProps.ctx).toEqual({ tenant: "one" });
    } finally { await f.close(); }
  });

  it("rejects invalid per-send data before appending a user message", async () => {
    const f = await fixture();
    try {
      await expect(f.host.sendMessage("invalid", { ctx: { fn: () => 1 } as never })).rejects.toMatchObject({ code: "AGENT_UI_INVALID_CTX" });
      expect(f.requests).toHaveLength(0);
      expect(f.native.thread.getState().messages).toHaveLength(0);
      await f.send("fresh");
      expect(f.requests[0]!.forwardedProps).not.toHaveProperty("ctx");
    } finally { await f.close(); }
  });

  it("preserves native forwarded settings and puts business fields in ctx", async () => {
    const f = await fixture({ tenant: "one" });
    const unregister = f.native.registerModelContextProvider({ getModelContext: () => ({ callSettings: { temperature: 0.4 } }) });
    try {
      await f.settle(async () => {
        f.native.thread.append({ role: "user", content: [{ type: "text", text: "native" }], runConfig: { custom: { source: "native" } } });
      });
      expect(f.requests[0]!.forwardedProps).toEqual({ temperature: 0.4, ctx: { source: "native", tenant: "one" } });
    } finally { unregister(); await f.close(); }
  });

  it("reports invalid defaults without issuing a request and recovers after props update", async () => {
    const f = await fixture({ value: undefined });
    try {
      let sent!: Promise<void>;
      await act(async () => { sent = f.host.sendMessage("invalid default"); void sent.catch(() => {}); });
      await expect(sent).rejects.toMatchObject({ code: "AGENT_UI_INVALID_CTX" });
      expect(f.requests).toHaveLength(0);
      expect(f.errors).toHaveBeenCalledWith(expect.objectContaining({ code: "AGENT_UI_INVALID_CTX" }));
      await f.update({ valid: true });
      await f.send("fresh");
      expect(f.requests[0]!.forwardedProps.ctx).toEqual({ valid: true });
    } finally { await f.close(); }
  });
});
