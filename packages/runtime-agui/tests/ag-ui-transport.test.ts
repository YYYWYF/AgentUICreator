import type {
  AbstractAgent,
  AgentSubscriber,
  RunAgentParameters,
} from "@ag-ui/client";
import {
  EventType,
  type Interrupt,
  type Message,
  type ResumeEntry,
  type State,
} from "@ag-ui/core";
import type { AgentFrontendToolSource } from "@agent-ui/runtime-core";
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
  readonly runParametersSeen: Array<RunAgentParameters | undefined> = [];

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

  async runAgent(parameters?: RunAgentParameters): Promise<unknown> {
    this.messagesSeenAtRun.push([...this.messages]);
    this.runParametersSeen.push(parameters);
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

  emitRunStarted(
    threadId: string,
    runId: string,
    resume?: ResumeEntry[],
  ): void {
    this.isRunning = true;
    this.subscribers.forEach((subscriber) => {
      const listener = subscriber.onRunStartedEvent;
      if (listener === undefined) return;
      void listener({
        event: { type: EventType.RUN_STARTED, threadId, runId },
        input: { ...(resume === undefined ? {} : { resume }) },
        messages: this.messages,
        state: this.state,
        agent: this as unknown as AbstractAgent,
      } as Parameters<typeof listener>[0]);
    });
  }

  emitRunFinished(
    threadId: string,
    runId: string,
    interrupts?: Interrupt[],
  ): void {
    this.isRunning = false;
    this.subscribers.forEach((subscriber) => {
      const listener = subscriber.onRunFinishedEvent;
      if (listener === undefined) return;
      const outcome = interrupts === undefined
        ? { type: "success" as const }
        : { type: "interrupt" as const, interrupts };
      void listener({
        event: { type: EventType.RUN_FINISHED, threadId, runId, outcome },
        outcome: outcome.type,
        ...(outcome.type === "interrupt" ? { interrupts } : {}),
        messages: this.messages,
        state: this.state,
        agent: this as unknown as AbstractAgent,
      } as Parameters<typeof listener>[0]);
    });
  }

  emitToolStart(
    toolCallId: string,
    subagentRunId?: string,
    toolCallName = "delete_files",
    parentMessageId?: string,
  ): void {
    this.subscribers.forEach((subscriber) => {
      const listener = subscriber.onToolCallStartEvent;
      if (listener === undefined) return;
      void listener({
        event: {
          type: EventType.TOOL_CALL_START,
          toolCallId,
          toolCallName,
          ...(subagentRunId === undefined ? {} : { subagentRunId }),
          ...(parentMessageId === undefined ? {} : { parentMessageId }),
        },
        messages: this.messages,
        state: this.state,
        agent: this as unknown as AbstractAgent,
      } as Parameters<typeof listener>[0]);
    });
  }

  emitToolArgs(
    toolCallId: string,
    delta: string,
    subagentRunId?: string,
  ): void {
    this.subscribers.forEach((subscriber) => {
      const listener = subscriber.onToolCallArgsEvent;
      if (listener === undefined) return;
      void listener({
        event: {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId,
          delta,
          ...(subagentRunId === undefined ? {} : { subagentRunId }),
        },
        messages: this.messages,
        state: this.state,
        agent: this as unknown as AbstractAgent,
      } as Parameters<typeof listener>[0]);
    });
  }

  emitToolEnd(toolCallId: string, subagentRunId?: string): void {
    this.subscribers.forEach((subscriber) => {
      const listener = subscriber.onToolCallEndEvent;
      if (listener === undefined) return;
      void listener({
        event: {
          type: EventType.TOOL_CALL_END,
          toolCallId,
          ...(subagentRunId === undefined ? {} : { subagentRunId }),
        },
        messages: this.messages,
        state: this.state,
        agent: this as unknown as AbstractAgent,
      } as Parameters<typeof listener>[0]);
    });
  }

  emitToolResult(toolCallId: string, subagentRunId?: string): void {
    this.subscribers.forEach((subscriber) => {
      const listener = subscriber.onToolCallResultEvent;
      if (listener === undefined) return;
      void listener({
        event: {
          type: EventType.TOOL_CALL_RESULT,
          toolCallId,
          messageId: `${toolCallId}-result`,
          content: "completed",
          ...(subagentRunId === undefined ? {} : { subagentRunId }),
        },
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

  emitCustom(
    name: string,
    value: unknown,
    subagentRunId?: string,
  ): void {
    this.subscribers.forEach((subscriber) => {
      const listener = subscriber.onCustomEvent;
      if (listener === undefined) return;
      void listener({
        event: {
          type: EventType.CUSTOM,
          name,
          value,
          ...(subagentRunId === undefined ? {} : { subagentRunId }),
          metadata: { privateWireMetadata: true },
          rawEvent: { privateWireEvent: true },
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
  it("projects CUSTOM into a cloned root application event without changing snapshots", () => {
    const agent = new FakeAgentClient();
    const transport = new AgUiTransport(
      { endpoint: "https://agent.example.test/ag-ui" },
      () => agent,
    );
    const snapshot = transport.getSnapshot();
    const snapshotListener = vi.fn();
    const eventListener = vi.fn();
    transport.subscribe(snapshotListener);
    transport.subscribeApplicationEvents(eventListener);
    const value = { changeId: "change-1", files: ["src/App.tsx"] };

    agent.emitCustom("workspace.patch.applied", value);

    expect(eventListener).toHaveBeenCalledWith({
      name: "workspace.patch.applied",
      payload: { changeId: "change-1", files: ["src/App.tsx"] },
      producer: { type: "root" },
    });
    expect(snapshotListener).not.toHaveBeenCalled();
    expect(transport.getSnapshot()).toBe(snapshot);

    value.files.push("src/late.tsx");
    const projected = eventListener.mock.calls[0]?.[0] as {
      payload: { files: string[] };
    };
    expect(projected.payload.files).toEqual(["src/App.tsx"]);
    projected.payload.files.push("src/runtime.tsx");
    expect(value.files).toEqual(["src/App.tsx", "src/late.tsx"]);
  });

  it("preserves subagent ownership for CUSTOM application events", () => {
    const agent = new FakeAgentClient();
    const transport = new AgUiTransport(
      { endpoint: "https://agent.example.test/ag-ui" },
      () => agent,
    );
    const listener = vi.fn();
    transport.subscribeApplicationEvents(listener);

    agent.emitCustom(
      "artifact.export.ready",
      { artifactId: "artifact-1" },
      "researcher",
    );

    expect(listener).toHaveBeenCalledWith({
      name: "artifact.export.ready",
      payload: { artifactId: "artifact-1" },
      producer: { type: "subagent", id: "researcher" },
    });
  });

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

  it("maps structured root and subagent interrupts into awaiting input", () => {
    const agent = new FakeAgentClient();
    const runtime = new AgUiTransport(
      { endpoint: "https://agent.example.test/ag-ui" },
      () => agent,
    );
    agent.emitRunStarted("thread", "run-1");
    agent.emitToolStart("delete-files", "researcher");
    agent.emitRunFinished("thread", "run-1", [
      {
        id: "root-input",
        reason: "human-input",
        message: "Choose a destination",
      },
      {
        id: "tool-approval",
        reason: "tool-approval",
        toolCallId: "delete-files",
        subagentRunId: "researcher",
      },
    ]);

    expect(runtime.getSnapshot()).toMatchObject({
      run: { id: "run-1", status: "awaiting-input" },
      interrupts: [
        {
          id: "root-input",
          producer: { type: "root" },
        },
        {
          id: "tool-approval",
          producer: { type: "subagent", id: "researcher" },
          toolExecutionId: "delete-files",
        },
      ],
      executions: [{ id: "delete-files", status: "interrupted" }],
    });
  });

  it("replaces interrupts across resume chains and preserves executions", () => {
    const agent = new FakeAgentClient();
    const runtime = new AgUiTransport(
      { endpoint: "https://agent.example.test/ag-ui" },
      () => agent,
    );
    agent.emitRunStarted("thread", "run-1");
    agent.emitToolStart("tool-a");
    agent.emitRunFinished("thread", "run-1", [{
      id: "interrupt-a",
      reason: "approval-a",
      toolCallId: "tool-a",
    }]);
    agent.emitRunStarted("thread", "run-2", [{
      interruptId: "interrupt-a",
      status: "resolved",
    }]);
    agent.emitRunFinished("thread", "run-2", [{
      id: "interrupt-b",
      reason: "approval-b",
    }]);

    expect(runtime.getSnapshot()).toMatchObject({
      run: { id: "run-2", status: "awaiting-input" },
      interrupts: [{ id: "interrupt-b" }],
      executions: [{ id: "tool-a" }],
    });

    agent.emitRunStarted("thread", "run-3", [{
      interruptId: "interrupt-b",
      status: "cancelled",
    }]);
    agent.emitRunFinished("thread", "run-3");

    expect(runtime.getSnapshot()).toMatchObject({
      run: { id: "run-3", status: "idle" },
      interrupts: [],
      executions: [{ id: "tool-a" }],
    });
  });

  it("does not treat abort as resolution while awaiting input", () => {
    const agent = new FakeAgentClient();
    const runtime = new AgUiTransport(
      { endpoint: "https://agent.example.test/ag-ui" },
      () => agent,
    );
    agent.emitRunStarted("thread", "run-1");
    agent.emitRunFinished("thread", "run-1", [{
      id: "approval",
      reason: "tool-approval",
    }]);

    runtime.abort();

    expect(agent.abortRun).not.toHaveBeenCalled();
    expect(runtime.getSnapshot()).toMatchObject({
      run: { id: "run-1", status: "awaiting-input" },
      interrupts: [{ id: "approval" }],
    });
  });

  it("resumes with RunAgentInput.resume and preserves the execution chain", async () => {
    const agent = new FakeAgentClient();
    let finishResume: () => void = () => undefined;
    agent.runAgent = vi.fn((parameters?: RunAgentParameters) => {
      agent.runParametersSeen.push(parameters);
      agent.isRunning = true;
      return new Promise<void>((resolve) => {
        finishResume = resolve;
      });
    });
    const runtime = new AgUiTransport(
      { endpoint: "https://agent.example.test/ag-ui" },
      () => agent,
    );
    agent.emitRunStarted("thread", "run-1");
    agent.emitToolStart("delete-files");
    agent.emitRunFinished("thread", "run-1", [{
      id: "approval",
      reason: "tool-approval",
      toolCallId: "delete-files",
    }]);

    const responses = [{
      interruptId: "approval",
      status: "resolved" as const,
      payload: { approved: true },
      metadata: { source: "tool-card" },
    }];
    const resume = runtime.resumeInterrupts(responses);
    expect(agent.runParametersSeen).toEqual([{
      resume: responses,
      tools: [],
    }]);
    expect(runtime.getSnapshot()).toMatchObject({
      run: { status: "running" },
      interrupts: [{ id: "approval" }],
      executions: [{ id: "delete-files", status: "interrupted" }],
    });

    agent.emitRunStarted("thread", "run-2", responses);
    expect(runtime.getSnapshot().executions).toMatchObject([
      { id: "delete-files", status: "interrupted" },
    ]);
    agent.emitToolResult("delete-files");
    expect(runtime.getSnapshot().executions).toMatchObject([
      { id: "delete-files", status: "completed" },
    ]);
    agent.emitRunFinished("thread", "run-2");
    finishResume();
    await resume;

    expect(runtime.getSnapshot()).toMatchObject({
      run: { id: "run-2", status: "idle" },
      interrupts: [],
      executions: [{ id: "delete-files", status: "completed" }],
    });
    expect(agent.messages).toEqual([]);
  });

  it("retains pending interrupts when a resume run fails", async () => {
    const agent = new FakeAgentClient();
    const failure = new Error("resume failed");
    const runtime = new AgUiTransport(
      { endpoint: "https://agent.example.test/ag-ui" },
      () => agent,
    );
    agent.emitRunStarted("thread", "run-1");
    agent.emitRunFinished("thread", "run-1", [{
      id: "approval",
      reason: "tool-approval",
    }]);
    agent.runAgent = vi.fn(async () => {
      throw failure;
    });

    await expect(runtime.resumeInterrupts([
      { interruptId: "approval", status: "cancelled" },
    ])).rejects.toThrow(failure);

    expect(runtime.getSnapshot()).toMatchObject({
      run: { status: "error", error: { message: "resume failed" } },
      interrupts: [{ id: "approval" }],
    });
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
      executions: [],
      interrupts: [],
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

  it("advertises current frontend tools and completes a subagent tool chain", async () => {
    const agent = new FakeAgentClient();
    const execute = vi.fn<AgentFrontendToolSource["execute"]>(async (call) => ({
      content: JSON.stringify({ opened: call.input }),
    }));
    const listTools = vi.fn(() => [{
      name: "editor_open_file",
      description: "Open an existing file without modifying it.",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      },
    }]);
    const frontendTools: AgentFrontendToolSource = { listTools, execute };
    let runCount = 0;
    agent.runAgent = vi.fn(async (parameters?: RunAgentParameters) => {
      agent.runParametersSeen.push(parameters);
      runCount += 1;
      agent.emitRunStarted("thread", `run-${runCount}`);
      if (runCount === 1) {
        agent.emitToolStart(
          "frontend-call",
          "researcher",
          "editor_open_file",
          "assistant-message",
        );
        agent.emitToolArgs("frontend-call", '{"path":', "researcher");
        agent.emitToolArgs("frontend-call", '"src/App.tsx"}', "researcher");
        agent.emitToolEnd("frontend-call", "researcher");
      }
      agent.emitRunFinished("thread", `run-${runCount}`);
    });
    const transport = new AgUiTransport(
      { endpoint: "https://agent.example.test/ag-ui", frontendTools },
      () => agent,
    );

    await transport.sendMessage({ content: "Open src/App.tsx" });

    expect(listTools).toHaveBeenCalledTimes(2);
    expect(agent.runParametersSeen).toHaveLength(2);
    expect(agent.runParametersSeen[0]).toEqual({
      tools: [{
        name: "editor_open_file",
        description: "Open an existing file without modifying it.",
        parameters: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
          additionalProperties: false,
        },
      }],
    });
    expect(agent.runParametersSeen[1]).toEqual(agent.runParametersSeen[0]);
    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0]?.[0]).toEqual({
      id: "frontend-call",
      name: "editor_open_file",
      input: { path: "src/App.tsx" },
      producer: { type: "subagent", id: "researcher" },
      parentMessageId: "assistant-message",
    });
    expect(agent.messages).toMatchObject([
      { role: "user", content: "Open src/App.tsx" },
      {
        role: "tool",
        toolCallId: "frontend-call",
        subagentRunId: "researcher",
      },
    ]);
    expect(agent.messages.filter((message) => message.role === "user"))
      .toHaveLength(1);
    expect(transport.getSnapshot()).toMatchObject({
      run: { status: "idle" },
      executions: [{
        type: "tool",
        id: "frontend-call",
        status: "completed",
        producer: { type: "subagent", id: "researcher" },
      }],
    });
  });

  it("returns malformed frontend arguments as a tool error and continues", async () => {
    const agent = new FakeAgentClient();
    const execute = vi.fn<AgentFrontendToolSource["execute"]>();
    const frontendTools: AgentFrontendToolSource = {
      listTools: () => [{
        name: "editor_open_file",
        description: "Open an existing file without modifying it.",
        inputSchema: { type: "object" },
      }],
      execute,
    };
    let runCount = 0;
    agent.runAgent = vi.fn(async (parameters?: RunAgentParameters) => {
      agent.runParametersSeen.push(parameters);
      runCount += 1;
      agent.emitRunStarted("thread", `run-${runCount}`);
      if (runCount === 1) {
        agent.emitToolStart("bad-args", undefined, "editor_open_file");
        agent.emitToolArgs("bad-args", '{"path":');
        agent.emitToolEnd("bad-args");
      }
      agent.emitRunFinished("thread", `run-${runCount}`);
    });
    const transport = new AgUiTransport(
      { endpoint: "https://agent.example.test/ag-ui", frontendTools },
      () => agent,
    );

    await transport.sendMessage({ content: "Open it" });

    expect(execute).not.toHaveBeenCalled();
    expect(agent.runParametersSeen).toHaveLength(2);
    expect(agent.messages.at(-1)).toMatchObject({
      role: "tool",
      toolCallId: "bad-args",
      content: "Invalid frontend tool arguments",
      error: expect.stringContaining("Invalid frontend tool arguments"),
    });
    expect(transport.getSnapshot()).toMatchObject({
      run: { status: "idle" },
      executions: [{ id: "bad-args", status: "error" }],
    });
  });

  it("lets a server tool result win and ignores non-advertised tools", async () => {
    const agent = new FakeAgentClient();
    const execute = vi.fn<AgentFrontendToolSource["execute"]>();
    const frontendTools: AgentFrontendToolSource = {
      listTools: () => [{
        name: "editor_open_file",
        description: "Open an existing file without modifying it.",
        inputSchema: { type: "object" },
      }],
      execute,
    };
    agent.runAgent = vi.fn(async (parameters?: RunAgentParameters) => {
      agent.runParametersSeen.push(parameters);
      agent.emitRunStarted("thread", "run-1");
      agent.emitToolStart("server-wins", undefined, "editor_open_file");
      agent.emitToolEnd("server-wins");
      agent.emitToolResult("server-wins");
      agent.emitToolStart("server-only", undefined, "database_search");
      agent.emitToolEnd("server-only");
      agent.emitRunFinished("thread", "run-1");
    });
    const transport = new AgUiTransport(
      { endpoint: "https://agent.example.test/ag-ui", frontendTools },
      () => agent,
    );

    await transport.sendMessage({ content: "Run tools" });

    expect(execute).not.toHaveBeenCalled();
    expect(agent.runParametersSeen).toHaveLength(1);
    expect(transport.getSnapshot().executions).toMatchObject([
      { id: "server-wins", status: "completed" },
      { id: "server-only", status: "interrupted" },
    ]);
  });

  it("does not execute frontend tools when a structured interrupt wins", async () => {
    const agent = new FakeAgentClient();
    const execute = vi.fn<AgentFrontendToolSource["execute"]>();
    const frontendTools: AgentFrontendToolSource = {
      listTools: () => [{
        name: "editor_open_file",
        description: "Open an existing file without modifying it.",
        inputSchema: { type: "object" },
      }],
      execute,
    };
    agent.runAgent = vi.fn(async (parameters?: RunAgentParameters) => {
      agent.runParametersSeen.push(parameters);
      agent.emitRunStarted("thread", "run-1");
      agent.emitToolStart("pending-tool", undefined, "editor_open_file");
      agent.emitToolEnd("pending-tool");
      agent.emitRunFinished("thread", "run-1", [{
        id: "approval",
        reason: "human-input",
      }]);
    });
    const transport = new AgUiTransport(
      { endpoint: "https://agent.example.test/ag-ui", frontendTools },
      () => agent,
    );

    await transport.sendMessage({ content: "Open it" });

    expect(execute).not.toHaveBeenCalled();
    expect(agent.runParametersSeen).toHaveLength(1);
    expect(transport.getSnapshot()).toMatchObject({
      run: { status: "awaiting-input" },
      interrupts: [{ id: "approval" }],
      executions: [{ id: "pending-tool", status: "interrupted" }],
    });
  });

  it("executes a frontend tool batch in event order with one continuation", async () => {
    const agent = new FakeAgentClient();
    const executionOrder: string[] = [];
    const frontendTools: AgentFrontendToolSource = {
      listTools: () => [
        {
          name: "editor_open_file",
          description: "Open an existing file without modifying it.",
          inputSchema: { type: "object" },
        },
        {
          name: "editor_reveal_range",
          description: "Reveal a range in the currently visible editor.",
          inputSchema: { type: "object" },
        },
      ],
      execute: async (call) => {
        executionOrder.push(call.name);
        return { content: call.name };
      },
    };
    let runCount = 0;
    agent.runAgent = vi.fn(async (parameters?: RunAgentParameters) => {
      agent.runParametersSeen.push(parameters);
      runCount += 1;
      agent.emitRunStarted("thread", `run-${runCount}`);
      if (runCount === 1) {
        agent.emitToolStart("call-a", undefined, "editor_open_file");
        agent.emitToolEnd("call-a");
        agent.emitToolStart("call-b", undefined, "editor_reveal_range");
        agent.emitToolEnd("call-b");
      } else {
        // Replayed IDs from a continuation never execute twice.
        agent.emitToolStart("call-a", undefined, "editor_open_file");
        agent.emitToolEnd("call-a");
      }
      agent.emitRunFinished("thread", `run-${runCount}`);
    });
    const transport = new AgUiTransport(
      { endpoint: "https://agent.example.test/ag-ui", frontendTools },
      () => agent,
    );

    await transport.sendMessage({ content: "Open and reveal" });

    expect(executionOrder).toEqual([
      "editor_open_file",
      "editor_reveal_range",
    ]);
    expect(agent.messages.filter((message) => message.role === "tool"))
      .toMatchObject([
        { toolCallId: "call-a", content: "editor_open_file" },
        { toolCallId: "call-b", content: "editor_reveal_range" },
      ]);
    expect(agent.runParametersSeen).toHaveLength(2);
  });

  it("aborts local frontend execution without adding a late result", async () => {
    const agent = new FakeAgentClient();
    let resolveTool: (result: { content: string }) => void = () => undefined;
    const execute = vi.fn<AgentFrontendToolSource["execute"]>(() =>
      new Promise((resolve) => {
        resolveTool = resolve;
      }));
    const frontendTools: AgentFrontendToolSource = {
      listTools: () => [{
        name: "editor_open_file",
        description: "Open an existing file without modifying it.",
        inputSchema: { type: "object" },
      }],
      execute,
    };
    agent.runAgent = vi.fn(async (parameters?: RunAgentParameters) => {
      agent.runParametersSeen.push(parameters);
      agent.emitRunStarted("thread", "run-1");
      agent.emitToolStart("slow-tool", undefined, "editor_open_file");
      agent.emitToolEnd("slow-tool");
      agent.emitRunFinished("thread", "run-1");
    });
    const transport = new AgUiTransport(
      { endpoint: "https://agent.example.test/ag-ui", frontendTools },
      () => agent,
    );

    const send = transport.sendMessage({ content: "Open it" });
    await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce());
    transport.abort();
    resolveTool({ content: "late success" });
    await send;

    expect(agent.messages.filter((message) => message.role === "tool"))
      .toHaveLength(0);
    expect(agent.runParametersSeen).toHaveLength(1);
    expect(transport.getSnapshot().executions).toMatchObject([
      { id: "slow-tool", status: "interrupted" },
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
