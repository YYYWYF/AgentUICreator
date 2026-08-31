import type { AbstractAgent, AgentSubscriber } from "@ag-ui/client";
import type { Message, State } from "@ag-ui/core";
import { describe, expect, it, vi } from "vitest";

import {
  createAgentRuntime,
  HttpAgentRuntime,
  MockAgentRuntime,
} from "../runtime/ag-ui";

class FakeAgentClient {
  messages: Message[] = [];
  state: State = {};
  isRunning = false;
  readonly abortRun = vi.fn();
  readonly messagesSeenAtRun: Message[][] = [];

  private readonly subscribers: AgentSubscriber[] = [];

  subscribe(subscriber: AgentSubscriber): { unsubscribe(): void } {
    this.subscribers.push(subscriber);
    return {
      unsubscribe: () => {
        const index = this.subscribers.indexOf(subscriber);
        if (index >= 0) {
          this.subscribers.splice(index, 1);
        }
      },
    };
  }

  addMessage(message: Message): void {
    this.messages.push(message);
    this.emitMessagesChanged();
  }

  async runAgent(): Promise<unknown> {
    this.messagesSeenAtRun.push([...this.messages]);
    return undefined;
  }

  emitMessages(messages: Message[]): void {
    this.messages = messages;
    this.emitMessagesChanged();
  }

  emitState(state: State): void {
    this.state = state;
    this.subscribers.forEach((subscriber) => {
      void subscriber.onStateChanged?.({
        messages: this.messages,
        state: this.state,
        agent: this as unknown as AbstractAgent,
      });
    });
  }

  private emitMessagesChanged(): void {
    this.subscribers.forEach((subscriber) => {
      void subscriber.onMessagesChanged?.({
        messages: this.messages,
        state: this.state,
        agent: this as unknown as AbstractAgent,
      });
    });
  }
}

describe("MockAgentRuntime", () => {
  it("starts with the configured AG-UI messages and state", () => {
    const runtime = new MockAgentRuntime({
      initialMessages: [
        { id: "assistant-1", role: "assistant", content: "Ready" },
      ],
      initialState: { selectedFile: "src/App.tsx" },
    });

    expect(runtime.mode).toBe("mock");
    expect(runtime.getSnapshot()).toMatchObject({
      messages: [
        { id: "assistant-1", role: "assistant", content: "Ready" },
      ],
      state: { selectedFile: "src/App.tsx" },
      isRunning: false,
      error: undefined,
    });
  });

  it("publishes user and assistant messages through the runtime boundary", async () => {
    const runtime = new MockAgentRuntime();
    const snapshots: number[] = [];
    const unsubscribe = runtime.subscribe(() => {
      snapshots.push(runtime.getSnapshot().messages.length);
    });

    await runtime.sendMessage("  inspect the UI  ");
    unsubscribe();

    expect(snapshots).toEqual([1, 2]);
    expect(runtime.getSnapshot()).toMatchObject({
      isRunning: false,
      messages: [
        { role: "user", content: "inspect the UI" },
        {
          role: "assistant",
          content: "Mock AG-UI received: inspect the UI",
        },
      ],
    });
  });

  it("clears messages, state, and errors for a new conversation", async () => {
    const runtime = new MockAgentRuntime({
      initialMessages: [
        { id: "assistant-1", role: "assistant", content: "Old context" },
      ],
      initialState: { selectedFile: "old.tsx" },
    });

    await runtime.startNewConversation();

    expect(runtime.getSnapshot()).toEqual({
      messages: [],
      state: {},
      isRunning: false,
      error: undefined,
    });
  });
});

describe("HttpAgentRuntime", () => {
  it("wraps one endpoint and adds the user message before running the agent", async () => {
    const agent = new FakeAgentClient();
    const createClient = vi.fn(() => agent);
    const runtime = new HttpAgentRuntime(
      { endpoint: "https://agent.example.test/ag-ui" },
      createClient,
    );

    await runtime.sendMessage("Hello Agent");

    expect(createClient).toHaveBeenCalledOnce();
    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://agent.example.test/ag-ui",
        threadId: expect.any(String),
      }),
    );
    expect(agent.messagesSeenAtRun[0]).toMatchObject([
      { role: "user", content: "Hello Agent" },
    ]);
    expect(runtime.getSnapshot()).toMatchObject({
      isRunning: false,
      error: undefined,
    });
  });

  it("projects AG-UI message and state subscriber updates", () => {
    const agent = new FakeAgentClient();
    const runtime = new HttpAgentRuntime(
      { endpoint: "https://agent.example.test/ag-ui" },
      () => agent,
    );

    agent.emitMessages([
      { id: "assistant-2", role: "assistant", content: "Updated" },
    ]);
    agent.emitState({ selectedFile: "plugins/chat/index.tsx" });

    expect(runtime.getSnapshot()).toMatchObject({
      messages: [
        { id: "assistant-2", role: "assistant", content: "Updated" },
      ],
      state: { selectedFile: "plugins/chat/index.tsx" },
    });
  });

  it("retains a failed run as runtime state and can abort the agent", async () => {
    const agent = new FakeAgentClient();
    const failure = new Error("Agent endpoint is unavailable");
    agent.runAgent = vi.fn(async () => {
      throw failure;
    });
    const runtime = new HttpAgentRuntime(
      { endpoint: "https://agent.example.test/ag-ui" },
      () => agent,
    );

    await expect(runtime.sendMessage("Hello")).rejects.toThrow(failure);
    runtime.abort();

    expect(runtime.getSnapshot()).toMatchObject({
      isRunning: false,
      error: failure,
    });
    expect(agent.abortRun).toHaveBeenCalledOnce();
  });

  it("creates a fresh AG-UI client and thread for a new conversation", async () => {
    const firstAgent = new FakeAgentClient();
    firstAgent.messages = [
      { id: "assistant-old", role: "assistant", content: "Old context" },
    ];
    firstAgent.state = { selectedFile: "old.tsx" };
    const secondAgent = new FakeAgentClient();
    const createClient = vi
      .fn()
      .mockReturnValueOnce(firstAgent)
      .mockReturnValueOnce(secondAgent);
    const runtime = new HttpAgentRuntime(
      { endpoint: "https://agent.example.test/ag-ui" },
      createClient,
    );

    await runtime.startNewConversation();

    const firstThreadId = createClient.mock.calls[0]?.[0].threadId;
    const secondThreadId = createClient.mock.calls[1]?.[0].threadId;
    expect(firstThreadId).toEqual(expect.any(String));
    expect(secondThreadId).toEqual(expect.any(String));
    expect(secondThreadId).not.toBe(firstThreadId);
    expect(runtime.getSnapshot()).toEqual({
      messages: [],
      state: {},
      isRunning: false,
      error: undefined,
    });

    firstAgent.emitMessages([
      { id: "stale", role: "assistant", content: "Stale update" },
    ]);
    expect(runtime.getSnapshot().messages).toEqual([]);

    await runtime.sendMessage("Fresh context");
    expect(secondAgent.messagesSeenAtRun[0]).toMatchObject([
      { role: "user", content: "Fresh context" },
    ]);
  });
});

describe("createAgentRuntime", () => {
  it("rejects a missing endpoint", () => {
    expect(() => createAgentRuntime({ endpoint: "   " })).toThrow(
      "必须配置智能体运行时端点。",
    );
  });
});
