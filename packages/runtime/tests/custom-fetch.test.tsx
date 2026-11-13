import { useAui, type AssistantRuntime } from "@assistant-ui/react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import {
  ConversationRuntimeProvider, createEphemeralConversationThreadBinding,
  createAgentUIFrontendTools, useConversationRuntimeBridge,
  type ConversationRuntimeBridge, type ConversationRuntimeProviderProps,
} from "../src/public.js";

afterEach(() => vi.unstubAllGlobals());
async function until(predicate: () => boolean) {
  await act(async () => { await vi.waitFor(() => expect(predicate()).toBe(true)); });
}
function response(input: { threadId: string; runId: string }, events: object[] = [], outcome?: object) {
  const frames = [{ type: "RUN_STARTED", threadId: input.threadId, runId: input.runId }, ...events,
    { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId, ...(outcome ? { outcome } : {}) }];
  return new Response(frames.map(event => `data: ${JSON.stringify(event)}\r\n\r\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
}
async function fixture(fetch: ConversationRuntimeProviderProps["fetch"]) {
  let native!: AssistantRuntime, bridge!: ConversationRuntimeBridge, tree!: ReactTestRenderer;
  const errors = vi.fn();
  const threadBinding = createEphemeralConversationThreadBinding();
  const frontendTools = createAgentUIFrontendTools([{ name: "confirm", description: "Confirm", inputSchema: { type: "object" }, execute: async () => "confirmed" }]);
  function Capture() {
    native = useAui().threads.__internal_getAssistantRuntime!();
    bridge = useConversationRuntimeBridge();
    return null;
  }
  const view = (fetch: ConversationRuntimeProviderProps["fetch"]) => <ConversationRuntimeProvider
    endpoint="https://example.test/run" threadBinding={threadBinding} fetch={fetch}
    request={{ headers: { Authorization: "Bearer fixture" }, credentials: "include" }}
    frontendTools={frontendTools} onError={errors}><Capture /></ConversationRuntimeProvider>;
  await act(async () => { tree = create(view(fetch)); });
  await until(() => native !== undefined && !native.thread.getState().isLoading);
  return {
    errors, get native() { return native; }, get bridge() { return bridge; },
    async update(fetch: ConversationRuntimeProviderProps["fetch"]) { await act(async () => tree.update(view(fetch))); },
    async close() { await act(async () => tree.unmount()); },
  };
}

it("uses custom fetch for tools and interrupt resumes with merged headers and the same thread", async () => {
  const fallback = vi.fn(); vi.stubGlobal("fetch", fallback);
  const requests: Record<string, any>[] = [];
  const custom = vi.fn<NonNullable<ConversationRuntimeProviderProps["fetch"]>>(async (url, init) => {
    expect(url).toBe("https://example.test/run");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer fixture");
    expect(init.credentials).toBe("include"); expect(init.signal).toBeInstanceOf(AbortSignal);
    const input = JSON.parse(String(init.body)); requests.push(input);
    if (requests.length === 1) return response(input, [
      { type: "TOOL_CALL_START", toolCallId: "tool-1", toolCallName: "confirm" },
      { type: "TOOL_CALL_ARGS", toolCallId: "tool-1", delta: "{}" },
      { type: "TOOL_CALL_END", toolCallId: "tool-1" },
    ]);
    return response(input, [], requests.length === 2
      ? { type: "interrupt", interrupts: [{ id: "approve", reason: "confirmation" }] } : { type: "success" });
  });
  const f = await fixture(custom);
  try {
    let sent!: Promise<void>;
    await act(async () => { sent = f.bridge.agentRuntime.sendMessage("Hello"); });
    await until(() => requests.length === 2 && !f.native.thread.getState().isRunning); await sent;
    expect(requests[1]!.messages).toMatchObject([{ role: "tool", toolCallId: "tool-1", content: "confirmed" }]);
    await act(async () => { sent = f.bridge.agentRuntime.resumeInterrupts([{ interruptId: "approve", status: "resolved", payload: true }]); });
    await until(() => requests.length === 3 && !f.native.thread.getState().isRunning); await sent;
    expect(requests[2]!.resume).toMatchObject([{ interruptId: "approve" }]);
    expect(new Set(requests.map(input => input.threadId)).size).toBe(1);
    expect(f.errors).not.toHaveBeenCalled(); expect(fallback).not.toHaveBeenCalled();
  } finally { await f.close(); }
});

it("delivers live SSE chunks and forwards cancellation to the custom fetch signal", async () => {
  let source!: ReadableStreamDefaultController<Uint8Array>, signal!: AbortSignal;
  const custom: NonNullable<ConversationRuntimeProviderProps["fetch"]> = async (_url, init) => {
    signal = init.signal!;
    const input = JSON.parse(String(init.body));
    return new Response(new ReadableStream<Uint8Array>({ start(controller) {
      source = controller;
      const frames = [{ type: "RUN_STARTED", threadId: input.threadId, runId: input.runId },
        { type: "TEXT_MESSAGE_START", messageId: "answer", role: "assistant" },
        { type: "TEXT_MESSAGE_CONTENT", messageId: "answer", delta: "Live answer" }];
      controller.enqueue(new TextEncoder().encode(frames.map(event => `data: ${JSON.stringify(event)}\r\n\r\n`).join("")));
      signal.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")), { once: true });
    } }), { headers: { "Content-Type": "text/event-stream" } });
  };
  const f = await fixture(custom);
  try {
    await act(async () => { void f.bridge.agentRuntime.sendMessage("Stream").catch(() => {}); });
    await until(() => f.native.thread.getState().messages.some(message => message.content.some(part => part.type === "text" && part.text === "Live answer")));
    expect(f.native.thread.getState().isRunning).toBe(true); expect(signal.aborted).toBe(false);
    await act(async () => f.native.thread.cancelRun());
    await until(() => signal.aborted && !f.native.thread.getState().isRunning);
    expect(source).toBeDefined();
  } finally { await f.close(); }
});

it("reports custom fetch errors and uses replacement or default fetch without resetting the thread", async () => {
  const failure = new Error("Custom request failed");
  const f = await fixture(async () => { throw failure; });
  try {
    await act(async () => { void f.bridge.agentRuntime.sendMessage("Fail").catch(() => {}); });
    await until(() => f.errors.mock.calls.length > 0 && !f.native.thread.getState().isRunning);
    expect(f.errors.mock.calls[0]![0]).toBe(failure);
    const requests: Record<string, any>[] = [];
    const custom = vi.fn<NonNullable<ConversationRuntimeProviderProps["fetch"]>>(async (_url, init) => {
      const input = JSON.parse(String(init.body)); requests.push(input); return response(input);
    });
    const originalNative = f.native;
    await f.update(custom);
    await act(async () => { void f.bridge.agentRuntime.sendMessage("Custom"); });
    await until(() => requests.length === 1 && !f.native.thread.getState().isRunning);
    vi.stubGlobal("fetch", custom); await f.update(undefined);
    await act(async () => { void f.bridge.agentRuntime.sendMessage("Default"); });
    await until(() => requests.length === 2 && !f.native.thread.getState().isRunning);
    expect(f.native).toBe(originalNative);
    expect(requests[0]!.threadId).toBe(requests[1]!.threadId);
    expect(f.native.thread.getState().messages.filter(message => message.role === "user")).toHaveLength(3);
  } finally { await f.close(); }
});
