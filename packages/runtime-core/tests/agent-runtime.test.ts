import { describe, expect, it, vi } from "vitest";

import {
  createAgentRuntime,
  type AgentTransport,
  type AgentUserInput,
} from "../src/index.js";
import { MockAgentTransport } from "../src/testing/index.js";

describe("protocol-independent runtime delegation", () => {
  it("retains cached snapshots, releases subscriptions and delegates disposal", async () => {
    const transport = new MockAgentTransport();
    const dispose = vi.spyOn(transport, "dispose");
    const runtime = createAgentRuntime({ transport });
    const listener = vi.fn();
    const unsubscribe = runtime.subscribe(listener);

    expect(runtime.getSnapshot()).toBe(runtime.getSnapshot());
    expect(runtime.getSnapshot()).toBe(transport.getSnapshot());
    const before = runtime.getSnapshot();
    await runtime.sendMessage("Hello");
    expect(runtime.getSnapshot()).not.toBe(before);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    await runtime.startNewConversation();
    expect(listener).toHaveBeenCalledTimes(2);
    runtime.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("normalizes string shorthand and preserves structured input", async () => {
    const sendMessage = vi.fn(async (_input: AgentUserInput) => undefined);
    const transport: AgentTransport<{ ready: boolean }> = {
      mode: "recording",
      getSnapshot: () => ({
        conversation: { id: "conversation" },
        messages: [],
        state: { ready: true },
        run: { status: "idle" },
      }),
      subscribe: () => () => undefined,
      sendMessage,
      startNewConversation: async () => undefined,
      abort: () => undefined,
    };
    const runtime = createAgentRuntime({ transport });
    const structured: AgentUserInput = {
      content: [
        { type: "text", text: "Inspect" },
        {
          type: "image",
          source: {
            type: "url",
            value: "https://example.test/image.png",
            mimeType: "image/png",
          },
          name: "image.png",
        },
      ],
    };

    await runtime.sendMessage("hello");
    await runtime.sendMessage(structured);

    expect(sendMessage).toHaveBeenNthCalledWith(1, { content: "hello" });
    expect(sendMessage).toHaveBeenNthCalledWith(2, structured);
  });

  it("aborts a pending mock reply without appending it to a new conversation", async () => {
    const runtime = createAgentRuntime({ transport: new MockAgentTransport() });
    const send = runtime.sendMessage("Old request");
    expect(runtime.getSnapshot().run.status).toBe("running");

    runtime.abort();
    expect(runtime.getSnapshot().run.status).toBe("idle");
    await runtime.startNewConversation();
    await send;
    expect(runtime.getSnapshot().messages).toEqual([]);

    await runtime.sendMessage("New request");
    expect(runtime.getSnapshot().messages.map((message) => message.content)).toEqual([
      "New request",
      "Mock agent received: New request",
    ]);
  });

  it("ignores blank input and rejects concurrent send and reset actions", async () => {
    const runtime = createAgentRuntime({ transport: new MockAgentTransport() });
    const before = runtime.getSnapshot();
    await runtime.sendMessage("   ");
    expect(runtime.getSnapshot()).toBe(before);

    const send = runtime.sendMessage("Hello");
    const concurrentSend = runtime.sendMessage("Another request");
    const reset = runtime.startNewConversation();
    await expect(concurrentSend).rejects.toThrow("智能体运行时正在处理另一条消息。");
    await expect(reset).rejects.toThrow("智能体运行时正在处理另一条消息。");
    await send;
  });

  it("accepts a transport with an arbitrary mode and no dispose method", async () => {
    const snapshot = {
      conversation: { id: "memory" },
      messages: [],
      state: { ready: true },
      run: { status: "idle" as const },
    };
    const transport: AgentTransport<{ ready: boolean }> = {
      mode: "in-memory-test",
      getSnapshot() { return snapshot; },
      subscribe: vi.fn(() => () => undefined),
      sendMessage: vi.fn(async () => undefined),
      startNewConversation: vi.fn(async () => undefined),
      abort: vi.fn(),
    };
    const runtime = createAgentRuntime({ transport });
    expect(runtime.mode).toBe("in-memory-test");
    expect(runtime.getSnapshot()).toBe(snapshot);
    await runtime.sendMessage("Hello");
    await runtime.startNewConversation();
    runtime.abort();
    runtime.dispose();
    expect(transport.sendMessage).toHaveBeenCalledWith({ content: "Hello" });
    expect(transport.startNewConversation).toHaveBeenCalledOnce();
    expect(transport.abort).toHaveBeenCalledOnce();
  });
});

describe("Runtime Core with MockAgentTransport", () => {
  it("starts with a conversation, configured state, and an idle run", () => {
    const runtime = createAgentRuntime({ transport: new MockAgentTransport({
      initialMessages: [
        { id: "assistant-1", role: "assistant", content: "Ready" },
      ],
      initialState: { selectedFile: "src/App.tsx" },
    }) });

    expect(runtime.mode).toBe("mock");
    expect(runtime.getSnapshot()).toMatchObject({
      conversation: { id: expect.any(String) },
      messages: [
        { id: "assistant-1", role: "assistant", content: "Ready" },
      ],
      state: { selectedFile: "src/App.tsx" },
      run: { status: "idle" },
    });
  });

  it("publishes user and assistant messages through the runtime boundary", async () => {
    const runtime = createAgentRuntime({ transport: new MockAgentTransport() });
    const snapshots: number[] = [];
    const unsubscribe = runtime.subscribe(() => {
      snapshots.push(runtime.getSnapshot().messages.length);
    });

    await runtime.sendMessage("  inspect the UI  ");
    unsubscribe();

    expect(snapshots).toEqual([1, 2]);
    expect(runtime.getSnapshot()).toMatchObject({
      run: { status: "idle", id: expect.any(String) },
      messages: [
        { role: "user", content: "inspect the UI" },
        {
          role: "assistant",
          content: "Mock agent received: inspect the UI",
        },
      ],
    });
  });

  it("creates a fresh conversation and resets messages, state, and run", async () => {
    const runtime = createAgentRuntime({ transport: new MockAgentTransport({
      initialMessages: [
        { id: "assistant-1", role: "assistant", content: "Old context" },
      ],
      initialState: { selectedFile: "old.tsx" },
    }) });
    const oldId = runtime.getSnapshot().conversation.id;

    await runtime.startNewConversation();

    expect(runtime.getSnapshot()).toEqual({
      conversation: { id: expect.any(String) },
      messages: [],
      state: {},
      run: { status: "idle" },
    });
    expect(runtime.getSnapshot().conversation.id).not.toBe(oldId);
  });
});
