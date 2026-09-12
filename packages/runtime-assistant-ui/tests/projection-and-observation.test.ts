import type { ThreadMessage, ThreadRuntime } from "@assistant-ui/react";
import { describe, expect, it, vi } from "vitest";

import { projectAssistantUiExecutions } from "../src/compatibility/execution-projector.js";
import { projectAssistantUiMessages } from "../src/compatibility/message-projector.js";
import { AssistantUiObservationSource } from "../src/observation/observation-source.js";

function assistantMessage(
  content: Extract<ThreadMessage, { role: "assistant" }>["content"],
  status: Extract<ThreadMessage, { role: "assistant" }>["status"] = {
    type: "complete",
    reason: "unknown",
  },
): ThreadMessage {
  return {
    id: "assistant-1",
    role: "assistant",
    createdAt: new Date(0),
    content,
    status,
    metadata: {
      unstable_state: null,
      unstable_annotations: [],
      unstable_data: [],
      steps: [],
      custom: {},
    },
  };
}

describe("assistant-ui compatibility projection", () => {
  it("projects text, reasoning, and multiple tool results from Runtime state", () => {
    const messages = [assistantMessage([
      { type: "reasoning", text: "Check inputs" },
      { type: "text", text: "Done" },
      {
        type: "tool-call",
        toolCallId: "tool-1",
        toolName: "lookup",
        args: { id: 1 },
        argsText: '{"id":1}',
        result: { value: "a" },
      },
      {
        type: "tool-call",
        toolCallId: "tool-2",
        toolName: "write",
        args: {},
        argsText: "{}",
        result: "failed",
        isError: true,
      },
    ])];
    expect(projectAssistantUiMessages(messages).map((message) => message.role))
      .toEqual(["reasoning", "assistant", "tool", "tool"]);
    expect(projectAssistantUiExecutions(messages)).toMatchObject([
      { id: "tool-1", status: "completed", name: "lookup" },
      { id: "tool-2", status: "error", name: "write" },
    ]);
  });

  it("exposes idle, running, completed, and error tool observation", () => {
    const listeners = new Set<() => void>();
    let state = {
      isRunning: false,
      messages: [] as ThreadMessage[],
    };
    const thread = {
      getState: () => ({ ...state }),
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    } as unknown as ThreadRuntime;
    const source = new AssistantUiObservationSource(thread, () => "thread-1");
    const listener = vi.fn();
    source.subscribe(listener);
    source.start();
    expect(source.getSnapshot()).toMatchObject({
      threadId: "thread-1",
      isRunning: false,
      toolCalls: [],
    });

    state = {
      isRunning: true,
      messages: [assistantMessage([{
        type: "tool-call",
        toolCallId: "tool-1",
        toolName: "lookup",
        args: { id: 1 },
        argsText: '{"id":1}',
      }], { type: "running" })],
    };
    for (const notify of listeners) notify();
    expect(source.getSnapshot().toolCalls[0]?.state).toBe("running");

    state = {
      isRunning: false,
      messages: [assistantMessage([
        {
          type: "tool-call",
          toolCallId: "tool-1",
          toolName: "lookup",
          args: { id: 1 },
          argsText: '{"id":1}',
          result: "ok",
        },
        {
          type: "tool-call",
          toolCallId: "tool-2",
          toolName: "write",
          args: {},
          argsText: "{}",
          result: "bad",
          isError: true,
        },
      ])],
    };
    for (const notify of listeners) notify();
    expect(source.getSnapshot().toolCalls.map((tool) => tool.state))
      .toEqual(["completed", "error"]);
    expect(listener).toHaveBeenCalled();
  });
});
