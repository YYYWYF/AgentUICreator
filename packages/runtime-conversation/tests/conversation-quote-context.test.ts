import { describe, expect, it } from "vitest";
import type { RunAgentInput } from "@ag-ui/client";
import type { ThreadMessage } from "@assistant-ui/react";
import { injectConversationQuoteContext } from "../src/compatibility/conversation-quote-context-agent.js";

const message = (id: string, text: string, quote?: { text: string; messageId: string }) => ({
  id, role: "user", content: [{ type: "text", text }], attachments: [], createdAt: new Date(0),
  metadata: { custom: quote === undefined ? {} : { quote } },
}) as ThreadMessage;
const input = (messages: RunAgentInput["messages"]): RunAgentInput => ({
  threadId: "thread", runId: "run", state: {}, tools: [], context: [], forwardedProps: {}, messages,
});
describe("outbound Quote context", () => {
  it("preserves quoted history across turns without mutating the UI or wire snapshot", () => {
    const ui = [message("one", "Why?", { text: "First line\nSecond line", messageId: "assistant" }), message("two", "Continue")];
    const wire = input([{ id: "one", role: "user", content: "Why?" }, { id: "two", role: "user", content: "Continue" }]);
    const before = structuredClone(wire);
    const result = injectConversationQuoteContext(wire, ui);
    expect(result.messages[0]!.content).toBe("> First line\n> Second line\n\nWhy?");
    expect(result.messages[1]).toBe(wire.messages[1]);
    expect(injectConversationQuoteContext(wire, ui)).toEqual(result);
    expect(wire).toEqual(before);
    expect(ui[0]!.content).toEqual([{ type: "text", text: "Why?" }]);
    expect(ui[0]!.metadata.custom.quote).toEqual({ text: "First line\nSecond line", messageId: "assistant" });
  });
  it("prepends one text part and preserves multimodal parts and order", () => {
    const parts = [{ type: "text" as const, text: "Describe" }, { type: "binary" as const, mimeType: "image/png", url: "https://example.test/image.png" }];
    const wire = input([{ id: "user", role: "user", content: parts }]);
    const result = injectConversationQuoteContext(wire, [message("user", "Describe", { text: "Passage", messageId: "assistant" })]);
    expect(result.messages[0]!.content).toEqual([{ type: "text", text: "> Passage\n\n" }, ...parts]);
    expect(wire.messages[0]!.content).toBe(parts);
  });
  it("is an identity operation without quote metadata and never guesses from text", () => {
    const wire = input([{ id: "plain", role: "user", content: "> just text\n\nWhy?" }]);
    expect(injectConversationQuoteContext(wire, [message("plain", "> just text\n\nWhy?")])).toBe(wire);
    expect(injectConversationQuoteContext(wire, [message("other", "Question", { text: "A", messageId: "assistant" })])).toBe(wire);
  });
});
