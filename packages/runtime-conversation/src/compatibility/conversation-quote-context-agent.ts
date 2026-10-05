import { Middleware, type AbstractAgent, type RunAgentInput } from "@ag-ui/client";
import type { ThreadMessage } from "@assistant-ui/react";

/** Only the outgoing copy changes. Quote ownership remains with assistant-ui. */
export function injectConversationQuoteContext(input: RunAgentInput, snapshot: readonly ThreadMessage[]): RunAgentInput {
  const quotes = new Map<string, string>();
  for (const message of snapshot) {
    if (message.role !== "user") continue;
    const quote = message.metadata.custom.quote;
    if (typeof quote !== "object" || quote === null || !("text" in quote) || typeof quote.text !== "string" || !("messageId" in quote) || typeof quote.messageId !== "string") continue;
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

/** Public AG-UI middleware wraps the real agent without a second lifecycle. */
export class ConversationQuoteContextAgent extends Middleware {
  constructor(public getMessages: () => readonly ThreadMessage[]) { super(); }
  override run(input: RunAgentInput, next: AbstractAgent) {
    return next.run(injectConversationQuoteContext(input, this.getMessages()));
  }
}

const installed = new WeakMap<AbstractAgent, ConversationQuoteContextAgent>();
/** Agent factories may reuse an instance across provider renders. Never stack injection. */
export function installConversationQuoteContext(agent: AbstractAgent, getMessages: () => readonly ThreadMessage[]): AbstractAgent {
  const existing = installed.get(agent);
  if (existing !== undefined) {
    existing.getMessages = getMessages;
    return agent;
  }
  const wrapper = new ConversationQuoteContextAgent(getMessages);
  installed.set(agent, wrapper);
  return agent.use(wrapper);
}
