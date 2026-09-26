import { describe, expect, it } from "vitest";
import type { ThreadMessage } from "@assistant-ui/react";
import { getAssistantResponseText, resolveAssistantResponseGroup } from "../src/internal/assistant-response.js";

function message(id: string, role: ThreadMessage["role"], text = id): ThreadMessage {
  return {
    id, role, content: [{ type: "text", text }], createdAt: new Date(0),
    ...(role === "assistant" ? { status: { type: "complete", reason: "stop" } } : {}),
    metadata: { unstable_state: null, unstable_annotations: [], unstable_data: [], steps: [], custom: {} },
  } as ThreadMessage;
}

describe("Assistant Response resolver", () => {
  it.each([
    [["user", "assistant"], 1, [1, 1]],
    [["user", "assistant", "assistant", "assistant"], 2, [1, 3]],
    [["user", "assistant", "assistant", "user", "assistant", "assistant"], 1, [1, 2]],
    [["user", "assistant", "assistant", "user", "assistant", "assistant"], 5, [4, 5]],
    [["system", "assistant", "assistant"], 2, [1, 2]],
    [["user", "assistant", "assistant", "system", "assistant"], 2, [1, 2]],
    [["user", "assistant", "assistant", "system", "assistant"], 4, [4, 4]],
    [["assistant", "assistant"], 0, [0, 1]],
  ] as const)("groups %j at %i", (roles, index, [head, tail]) => {
    const messages = roles.map((role, i) => message(String(i), role));
    const before = [...messages];
    const group = resolveAssistantResponseGroup(messages, index);
    expect(group).toEqual({
      headMessageId: String(head), tailMessageId: String(tail),
      headIndex: head, tailIndex: tail,
      requestMessageId: head === 0 ? null : String(head - 1),
      messageIds: messages.slice(head, tail + 1).map(({ id }) => id),
    });
    expect(messages).toEqual(before);
    messages.forEach((entry, i) => expect(entry).toBe(before[i]));
  });

  it("rejects boundaries and invalid indices", () => {
    const messages = [message("u", "user"), message("a", "assistant")];
    for (const index of [-1, 0, 2, 0.5, NaN]) expect(resolveAssistantResponseGroup(messages, index)).toBeNull();
  });

  it("keeps an empty multi-message response non-copyable", () => {
    const messages = [message("a", "assistant", ""), message("b", "assistant", "")];
    expect(getAssistantResponseText(messages, resolveAssistantResponseGroup(messages, 0)!)).toBe("");
  });

  it("copies text parts in Thread order without reasoning or nested messages", () => {
    const a = message("a", "assistant");
    const messages = [
      { ...a, content: [
        { type: "text", text: "Hello" },
        { type: "reasoning", text: "private" },
        { type: "text", text: "again" },
        { type: "tool-call", toolCallId: "tool", toolName: "delegate", args: {}, argsText: "{}", result: "excluded", messages: [message("nested", "assistant", "excluded")] },
        { type: "data", name: "chart", data: { text: "excluded" } },
      ] } as ThreadMessage,
      message("b", "assistant", "World"),
    ];
    expect(getAssistantResponseText(messages, resolveAssistantResponseGroup(messages, 1)!))
      .toBe("Hello\n\nagain\n\nWorld");
  });
});
