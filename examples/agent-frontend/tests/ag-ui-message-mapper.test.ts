import { describe, expect, it } from "vitest";

import { mapAgUiMessage } from "../runtime/ag-ui/message-mapper";

type AgUiMessage = Parameters<typeof mapAgUiMessage>[0];

describe("AG-UI message mapper", () => {
  it.each([
    {
      source: { id: "user-1", role: "user", content: "Hello" } satisfies AgUiMessage,
      expected: { id: "user-1", role: "user", content: "Hello" },
    },
    {
      source: { id: "assistant-1", role: "assistant", content: "Hi" } satisfies AgUiMessage,
      expected: { id: "assistant-1", role: "assistant", content: "Hi" },
    },
    {
      source: { id: "system-1", role: "system", content: "System instructions" } satisfies AgUiMessage,
      expected: { id: "system-1", role: "system", content: "System instructions" },
    },
    {
      source: { id: "tool-1", role: "tool", toolCallId: "call-1", content: "Tool result" } satisfies AgUiMessage,
      expected: { id: "tool-1", role: "tool", toolCallId: "call-1", content: "Tool result" },
    },
    {
      source: { id: "developer-1", role: "developer", content: "Developer context" } satisfies AgUiMessage,
      expected: { id: "developer-1", role: "developer", content: "Developer context" },
    },
    {
      source: { id: "reasoning-1", role: "reasoning", content: "Reasoning trace" } satisfies AgUiMessage,
      expected: { id: "reasoning-1", role: "reasoning", content: "Reasoning trace" },
    },
  ])("maps $source.role messages", ({ source, expected }) => {
    expect(mapAgUiMessage(source)).toEqual(expected);
  });

  it("maps assistant tool calls without retaining AG-UI-only fields", () => {
    const source: AgUiMessage = {
      id: "assistant-tool-call",
      role: "assistant",
      toolCalls: [{
        id: "call-1",
        type: "function",
        function: { name: "lookup", arguments: '{"query":"status"}' },
        encryptedValue: "adapter-only",
      }],
    };

    expect(mapAgUiMessage(source)).toEqual({
      id: "assistant-tool-call",
      role: "assistant",
      toolCalls: [{
        id: "call-1",
        type: "function",
        function: { name: "lookup", arguments: '{"query":"status"}' },
      }],
    });
  });

  it("maps activity messages", () => {
    const source: AgUiMessage = {
      id: "activity-1",
      role: "activity",
      activityType: "analysis",
      content: { title: "Working", progress: 50 },
    };

    expect(mapAgUiMessage(source)).toEqual({
      id: "activity-1",
      role: "activity",
      activityType: "analysis",
      content: { title: "Working", progress: 50 },
    });
  });
});
