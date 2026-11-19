import type { RunAgentInput } from "@ag-ui/client";
import type { ThreadMessage } from "@assistant-ui/react";

/** Only the outgoing copy changes. Quote ownership remains with assistant-ui. */
export function injectConversationQuoteContext(input: RunAgentInput, snapshot: readonly ThreadMessage[]): RunAgentInput {
  const quotes = new Map<string, string>();
  for (const message of snapshot) {
    if (message.role !== "user") continue;
    const quote = message.metadata.custom.quote;
    if (typeof quote !== "object" || quote === null || !("text" in quote) || typeof quote.text !== "string" || quote.text.trim().length === 0 || !("messageId" in quote) || typeof quote.messageId !== "string" || quote.messageId.trim().length === 0) continue;
    quotes.set(message.id, quote.text.split("\n").map(line => `> ${line}`).join("\n"));
  }
  let changed = false;
  const messages = input.messages.map(message => {
    if (message.role !== "user") return message;
    const context = quotes.get(message.id);
    if (context === undefined) return message;
    changed = true;
    return {
      ...message,
      content: typeof message.content === "string"
        ? `${context}\n\n${message.content}`
        : [{ type: "text" as const, text: `${context}\n\n` }, ...message.content],
    };
  });
  return changed ? { ...input, messages } : input;
}
