// @vitest-environment jsdom

import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import type {
  AgentExecution,
  AgentMessage,
  AgentRuntime,
  AgentRuntimeSnapshot,
} from "@agent-ui/runtime-core";

const assistantUiMock = vi.hoisted(() => ({
  observation: {
    schemaVersion: 1 as const,
    threadId: "thread-test",
    isRunning: true,
    toolCalls: [],
  },
}));

vi.mock("@agent-ui/runtime-assistant-ui", () => ({
  useAssistantUiRuntimeObservation: () => assistantUiMock.observation,
}));

import { AgentRuntimeProvider } from "../runtime/context";
import { RuntimePanel } from "../src/dev/DevStudio/RuntimePanel";
import { RuntimePanelView } from "../src/dev/DevStudio/RuntimePanelView";

function snapshot(
  overrides: Partial<AgentRuntimeSnapshot> = {},
): AgentRuntimeSnapshot {
  return {
    conversation: { id: "thread-test" },
    messages: [],
    state: undefined,
    run: { status: "idle" },
    executions: [],
    interrupts: [],
    ...overrides,
  };
}

function createRuntime(initial: AgentRuntimeSnapshot): AgentRuntime {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    mode: "test",
    getSnapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeApplicationEvents: () => () => undefined,
    sendMessage: async () => undefined,
    resumeInterrupts: async () => undefined,
    startNewConversation: async () => undefined,
    abort: () => undefined,
    dispose: () => undefined,
    publish(next: AgentRuntimeSnapshot) {
      current = next;
      for (const listener of listeners) listener();
    },
  } as AgentRuntime & { publish(next: AgentRuntimeSnapshot): void };
}

function renderedText(renderer: ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON());
}

describe("RuntimePanel", () => {
  it("renders normalized runtime summary and execution types", () => {
    const messages: AgentMessage[] = [
      { id: "user-1", producer: { type: "root" }, role: "user", content: "Hi" },
      { id: "assistant-1", producer: { type: "root" }, role: "assistant", content: "Hello" },
    ];
    const executions: AgentExecution[] = [
      {
        type: "reasoning",
        id: "reasoning-1",
        producer: { type: "root" },
        status: "completed",
        messageIds: [],
      },
      {
        type: "tool",
        id: "tool-1",
        producer: { type: "root" },
        name: "search_files",
        status: "awaiting-result",
        arguments: "{}",
      },
      {
        type: "subagent",
        id: "subagent-1",
        producer: { type: "root" },
        name: "worker-1",
        status: "completed",
      },
    ];
    const renderer = create(
      <RuntimePanelView
        assistantUiObservation={assistantUiMock.observation}
        endpoint="/__agent-ui/mock?scenario=subagents&speed=1"
        mockEnabled
        snapshot={snapshot({
          messages,
          run: { status: "running" },
          executions,
          interrupts: [{
            id: "interrupt-1",
            reason: "Approval required",
            producer: { type: "root" },
            toolExecutionId: "tool-1",
          }],
        })}
      />,
    );

    const text = renderedText(renderer);
    expect(text).toContain("thread-test");
    expect(text).toContain("running");
    expect(text).toContain("2 messages");
    expect(text).toContain("3 executions");
    expect(text).toContain("1 interrupts");
    expect(text).toContain("reasoning");
    expect(text).toContain("tool");
    expect(text).toContain("subagent");
  });

  it("updates when the AgentRuntime publishes a new snapshot", async () => {
    const runtime = createRuntime(snapshot({
      run: { status: "running" },
      executions: [{
        type: "tool",
        id: "tool-1",
        producer: { type: "root" },
        name: "search_files",
        status: "awaiting-result",
        arguments: "{}",
      }],
    })) as AgentRuntime & { publish(next: AgentRuntimeSnapshot): void };
    const renderer = create(
      <AgentRuntimeProvider runtime={runtime}>
        <RuntimePanel endpoint="https://agent.example/api" mockEnabled={false} />
      </AgentRuntimeProvider>,
    );

    expect(renderedText(renderer)).toContain("running");
    await act(async () => {
      runtime.publish(snapshot({
        run: { status: "idle" },
        executions: [{
          type: "tool",
          id: "tool-1",
          producer: { type: "root" },
          name: "search_files",
          status: "completed",
          arguments: "{}",
        }],
      }));
    });

    const text = renderedText(renderer);
    expect(text).toContain("idle");
    expect(text).toContain("completed");
  });

  it("keeps both normalized and assistant-ui raw snapshots available", () => {
    const renderer = create(
      <RuntimePanelView
        assistantUiObservation={{
          ...assistantUiMock.observation,
          toolCalls: [{
            toolCallId: "tool-1",
            toolName: "search_files",
            state: "completed",
          }],
        }}
        endpoint="https://agent.example/api"
        mockEnabled={false}
        snapshot={snapshot()}
      />,
    );

    const text = renderedText(renderer);
    expect(text).toContain("Raw Snapshot");
    expect(text).toContain("AgentRuntime");
    expect(text).toContain("assistant-ui");
    expect(text).toContain("tool-1");
  });
});
