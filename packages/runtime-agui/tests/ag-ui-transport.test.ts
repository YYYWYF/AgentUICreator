import type { AbstractAgent, AgentSubscriber } from "@ag-ui/client";
import { EventType, type Message, type State } from "@ag-ui/core";
import { describe, expect, it, vi } from "vitest";

import {
  AgUiTransport,
  createAgUiTransport,
} from "../src/AgUiTransport.js";

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

  emitRunStarted(threadId: string, runId: string): void {
    this.isRunning = true;
    this.subscribers.forEach((subscriber) => {
      const listener = subscriber.onRunStartedEvent;
      if (listener === undefined) return;
      void listener({
        event: { type: EventType.RUN_STARTED, threadId, runId },
        messages: this.messages,
        state: this.state,
        agent: this as unknown as AbstractAgent,
      } as Parameters<typeof listener>[0]);
    });
  }

  emitRunFinished(threadId: string, runId: string): void {
    this.isRunning = false;
    this.subscribers.forEach((subscriber) => {
      const listener = subscriber.onRunFinishedEvent;
      if (listener === undefined) return;
      void listener({
        event: { type: EventType.RUN_FINISHED, threadId, runId },
        outcome: "success",
        messages: this.messages,
        state: this.state,
        agent: this as unknown as AbstractAgent,
      } as Parameters<typeof listener>[0]);
    });
  }

  emitRunError(message: string, code?: string): void {
    this.isRunning = false;
    this.subscribers.forEach((subscriber) => {
      const listener = subscriber.onRunErrorEvent;
      if (listener === undefined) return;
      void listener({
        event: {
          type: EventType.RUN_ERROR,
          message,
          ...(code === undefined ? {} : { code }),
        },
        messages: this.messages,
        state: this.state,
        agent: this as unknown as AbstractAgent,
      } as Parameters<typeof listener>[0]);
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

    const send = transport.sendMessage({ content: "Hello" });
    expect(transport.getSnapshot().run.status).toBe("running");
    const assistant: Message = { id: "stream", role: "assistant", content: "H" };
    agent.emitMessages([...agent.messages, assistant]);
    const partial = transport.getSnapshot();
    assistant.content = "Hello back";
    agent.emitMessages(agent.messages);
    expect(partial.messages.at(-1)?.content).toBe("H");
    expect(transport.getSnapshot().messages.at(-1)?.content).toBe("Hello back");
    expect(transport.getSnapshot().run.status).toBe("running");
    expect(listener).toHaveBeenCalled();

    agent.isRunning = false;
    finishRun();
    await send;
    expect(transport.getSnapshot().run.status).toBe("idle");
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

  it("maps the client thread to conversation and adds input before running", async () => {
    const agent = new FakeAgentClient();
    const createClient = vi.fn(() => agent);
    const runtime = new AgUiTransport(
      { endpoint: "https://agent.example.test/ag-ui" },
      createClient,
    );

    await runtime.sendMessage({ content: "Hello Agent" });

    const threadId = createClient.mock.calls[0]?.[0].threadId;
    expect(createClient).toHaveBeenCalledWith({
      endpoint: "https://agent.example.test/ag-ui",
      threadId,
    });
    expect(runtime.getSnapshot().conversation).toEqual({ id: threadId });
    expect(agent.messagesSeenAtRun[0]).toMatchObject([
      { role: "user", content: "Hello Agent" },
    ]);
    expect(runtime.getSnapshot().run).toEqual({ status: "idle" });
  });

  it("projects typed AG-UI state subscriber updates", () => {
    interface AppState {
      selectedFile?: string;
    }
    const agent = new FakeAgentClient();
    const runtime = new AgUiTransport<AppState>(
      { endpoint: "https://agent.example.test/ag-ui" },
      () => agent,
    );

    agent.emitMessages([
      { id: "assistant-2", role: "assistant", content: "Updated" },
    ]);
    agent.emitState({ selectedFile: "plugins/chat/index.tsx" });
    const selectedFile: string | undefined =
      runtime.getSnapshot().state.selectedFile;

    expect(runtime.getSnapshot()).toMatchObject({
      messages: [
        { id: "assistant-2", role: "assistant", content: "Updated" },
      ],
      state: { selectedFile: "plugins/chat/index.tsx" },
    });
    expect(selectedFile).toBe("plugins/chat/index.tsx");
  });

  it("maps run lifecycle ids, errors, and recovery into the runtime contract", () => {
    const agent = new FakeAgentClient();
    const runtime = new AgUiTransport(
      { endpoint: "https://agent.example.test/ag-ui" },
      () => agent,
    );

    agent.emitRunStarted("server-thread", "run-1");
    expect(runtime.getSnapshot()).toMatchObject({
      conversation: { id: "server-thread" },
      run: { id: "run-1", status: "running" },
    });

    agent.emitRunError("Agent endpoint is unavailable", "UNAVAILABLE");
    expect(runtime.getSnapshot().run).toEqual({
      id: "run-1",
      status: "error",
      error: {
        message: "Agent endpoint is unavailable",
        code: "UNAVAILABLE",
      },
    });

    agent.emitRunStarted("server-thread", "run-2");
    expect(runtime.getSnapshot().run).toEqual({
      id: "run-2",
      status: "running",
    });
    agent.emitRunFinished("server-thread", "run-2");
    expect(runtime.getSnapshot().run).toEqual({
      id: "run-2",
      status: "idle",
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

    await expect(runtime.sendMessage({ content: "Hello" })).rejects.toThrow(failure);
    runtime.abort();

    expect(runtime.getSnapshot().run).toEqual({
      status: "error",
      error: { message: failure.message },
    });
    expect(agent.abortRun).toHaveBeenCalledOnce();
  });

  it("settles an aborted running snapshot", () => {
    const agent = new FakeAgentClient();
    const runtime = new AgUiTransport(
      { endpoint: "https://agent.example.test/ag-ui" },
      () => agent,
    );
    agent.emitRunStarted("thread", "run");

    runtime.abort();

    expect(runtime.getSnapshot().run).toEqual({ id: "run", status: "idle" });
  });

  it("creates a fresh AG-UI client and conversation", async () => {
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
    const oldId = runtime.getSnapshot().conversation.id;

    await runtime.startNewConversation();

    const firstThreadId = createClient.mock.calls[0]?.[0].threadId;
    const secondThreadId = createClient.mock.calls[1]?.[0].threadId;
    expect(firstThreadId).toBe(oldId);
    expect(secondThreadId).not.toBe(firstThreadId);
    expect(runtime.getSnapshot()).toEqual({
      conversation: { id: secondThreadId },
      messages: [],
      state: {},
      run: { status: "idle" },
    });

    firstAgent.emitMessages([
      { id: "stale", role: "assistant", content: "Stale update" },
    ]);
    expect(runtime.getSnapshot().messages).toEqual([]);

    await runtime.sendMessage({ content: "Fresh context" });
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
