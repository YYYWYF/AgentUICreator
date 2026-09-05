import type { Message } from "@ag-ui/core";
import { describe, expect, it } from "vitest";

import { mapAgUiMessage } from "../runtime/ag-ui/message-mapper";

describe("AG-UI message mapper", () => {
  it.each([
    {
      source: { id: "user-1", role: "user", content: "Hello" } satisfies Message,
      expected: { id: "user-1", role: "user", content: "Hello" },
    },
    {
      source: { id: "assistant-1", role: "assistant", content: "Hi" } satisfies Message,
      expected: { id: "assistant-1", role: "assistant", content: "Hi" },
    },
    {
      source: { id: "system-1", role: "system", content: "System instructions" } satisfies Message,
      expected: { id: "system-1", role: "system", content: "System instructions" },
    },
    {
      source: { id: "tool-1", role: "tool", toolCallId: "call-1", content: "Tool result" } satisfies Message,
      expected: { id: "tool-1", role: "tool", toolCallId: "call-1", content: "Tool result" },
    },
    {
      source: { id: "developer-1", role: "developer", content: "Developer context" } satisfies Message,
      expected: { id: "developer-1", role: "developer", content: "Developer context" },
    },
    {
      source: { id: "reasoning-1", role: "reasoning", content: "Reasoning trace" } satisfies Message,
      expected: { id: "reasoning-1", role: "reasoning", content: "Reasoning trace" },
    },
  ])("maps $source.role messages", ({ source, expected }) => {
    expect(mapAgUiMessage(source)).toEqual(expected);
  });

  it("maps assistant tool calls without retaining AG-UI-only fields", () => {
    const source: Message = {
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
    const source: Message = {
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
