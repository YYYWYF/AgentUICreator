import type { AbstractAgent, AgentSubscriber } from "@ag-ui/client";
import type { Message, State } from "@ag-ui/core";
import { describe, expect, it, vi } from "vitest";

import { AgUiTransport, createAgUiTransport } from "./AgUiTransport";

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

describe("AgUiTransport", () => {
  it("publishes streaming text with stable old snapshots and running state", async () => {
    const agent = new FakeAgentClient();
    let finishRun: () => void = () => undefined;
    agent.runAgent = vi.fn(() => new Promise<void>((resolve) => {
      agent.isRunning = true;
      finishRun = resolve;
    }));
    const transport = new AgUiTransport({ endpoint: "https://agent.example.test/ag-ui" }, () => agent);
    const listener = vi.fn();
    transport.subscribe(listener);

    const send = transport.sendMessage("Hello");
    expect(transport.getSnapshot().isRunning).toBe(true);
    const assistant: Message = { id: "stream", role: "assistant", content: "H" };
    agent.emitMessages([...agent.messages, assistant]);
    const partial = transport.getSnapshot();
    assistant.content = "Hello back";
    agent.emitMessages(agent.messages);
    expect(partial.messages.at(-1)?.content).toBe("H");
    expect(transport.getSnapshot().messages.at(-1)?.content).toBe("Hello back");
    expect(transport.getSnapshot().isRunning).toBe(true);
    expect(listener).toHaveBeenCalled();

    agent.isRunning = false;
    finishRun();
    await send;
    expect(transport.getSnapshot().isRunning).toBe(false);
  });

  it("detaches SDK subscriptions and aborts once on disposal", () => {
    const agent = new FakeAgentClient();
    const transport = new AgUiTransport({ endpoint: "https://agent.example.test/ag-ui" }, () => agent);
    const listener = vi.fn();
    transport.subscribe(listener);
    const before = transport.getSnapshot();
    transport.dispose();
    transport.dispose();
    agent.emitState({ stale: true });
    expect(agent.abortRun).toHaveBeenCalledOnce();
    expect(transport.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it("wraps one endpoint and adds the user message before running the agent", async () => {
    const agent = new FakeAgentClient();
    const createClient = vi.fn(() => agent);
    const runtime = new AgUiTransport(
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
    const runtime = new AgUiTransport(
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
    const runtime = new AgUiTransport(
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
    const runtime = new AgUiTransport(
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

describe("createAgUiTransport", () => {
  it("rejects a missing endpoint", () => {
    expect(() => createAgUiTransport({ endpoint: "   " })).toThrow(
      "必须配置智能体运行时端点。",
    );
  });
});
