import { describe, expect, it } from "vitest";

import type { AgentMessage } from "../framework/contracts/ui-plugin";
import { inspectToolCalls } from "../plugins/_shared/agent-ui-data";
import { projectTurnToolActivities } from "../plugins/agent-message-list/tool-presentation";

function withConversation(message: AgentMessage): AgentMessage {
  return {
    ...message,
    metadata: { ...message.metadata, conversationId: "default" },
  };
}

function projection(messages: AgentMessage[]) {
  const inspections = inspectToolCalls(messages, []);
  return projectTurnToolActivities(
    messages,
    new Map(inspections.map((inspection) => [inspection.id, inspection])),
  );
}

describe("tool presentation projection", () => {
  it("groups consecutive tool activity and merges paired results", () => {
    const messages: AgentMessage[] = [
      withConversation({
        id: "reasoning-a",
        producer: { type: "root" },
        role: "reasoning",
        content: "reasoning A",
      }),
      withConversation({
        id: "tool-call-a",
        producer: { type: "root" },
        role: "assistant",
        toolCalls: [{
          id: "tool-a",
          type: "function",
          function: { name: "tool_A", arguments: "{}" },
        }],
      }),
      withConversation({
        id: "tool-result-a",
        producer: { type: "root" },
        role: "tool",
        toolCallId: "tool-a",
        content: "result A",
      }),
      withConversation({
        id: "tool-call-b",
        producer: { type: "root" },
        role: "assistant",
        toolCalls: [{
          id: "tool-b",
          type: "function",
          function: { name: "tool_B", arguments: "{}" },
        }],
      }),
      withConversation({
        id: "tool-result-b",
        producer: { type: "root" },
        role: "tool",
        toolCallId: "tool-b",
        content: "result B",
      }),
      withConversation({
        id: "final",
        producer: { type: "root" },
        role: "assistant",
        content: "done",
      }),
    ];

    const segments = projection(messages);

    expect(segments.map((segment) => segment.kind)).toEqual([
      "message",
      "tool-activity",
      "message",
    ]);
    const activity = segments[1];
    expect(activity?.kind).toBe("tool-activity");
    if (activity?.kind !== "tool-activity") return;
    expect(activity.items.map((item) => item.toolCall.id)).toEqual([
      "tool-a",
      "tool-b",
    ]);
    expect(activity.items.map((item) => item.result?.content)).toEqual([
      "result A",
      "result B",
    ]);
  });

  it("splits activities across text and reasoning while preserving mixed message order", () => {
    const messages: AgentMessage[] = [
      withConversation({
        id: "mixed-a",
        producer: { type: "root" },
        role: "assistant",
        content: "before A",
        toolCalls: [{
          id: "tool-a",
          type: "function",
          function: { name: "tool_A", arguments: "{}" },
        }],
      }),
      withConversation({
        id: "reasoning-b",
        producer: { type: "root" },
        role: "reasoning",
        content: "reasoning B",
      }),
      withConversation({
        id: "tool-call-b",
        producer: { type: "root" },
        role: "assistant",
        toolCalls: [{
          id: "tool-b",
          type: "function",
          function: { name: "tool_B", arguments: "{}" },
        }],
      }),
      withConversation({
        id: "text-c",
        producer: { type: "root" },
        role: "assistant",
        content: "between B and C",
      }),
      withConversation({
        id: "tool-call-c",
        producer: { type: "root" },
        role: "assistant",
        toolCalls: [{
          id: "tool-c",
          type: "function",
          function: { name: "tool_C", arguments: "{}" },
        }],
      }),
    ];

    const segments = projection(messages);

    expect(segments.map((segment) => segment.kind)).toEqual([
      "message",
      "tool-activity",
      "message",
      "tool-activity",
      "message",
      "tool-activity",
    ]);
    expect(
      segments.flatMap((segment) =>
        segment.kind === "tool-activity"
          ? segment.items.map((item) => item.toolCall.id)
          : [],
      ),
    ).toEqual(["tool-a", "tool-b", "tool-c"]);
  });

  it("keeps an unmatched tool result as a generic message segment", () => {
    const messages: AgentMessage[] = [
      withConversation({
        id: "orphan-result",
        producer: { type: "root" },
        role: "tool",
        toolCallId: "missing-call",
        content: "orphan result",
      }),
    ];

    expect(projection(messages)).toEqual([
      { kind: "message", id: "orphan-result", message: messages[0] },
    ]);
  });
});
