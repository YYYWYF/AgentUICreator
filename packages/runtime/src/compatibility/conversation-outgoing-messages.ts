import { Middleware, type AbstractAgent, type RunAgentInput } from "@ag-ui/client";

/** History stays in the conversation runtime; the server owns its transcript. */
class ConversationOutgoingMessages extends Middleware {
  override run(input: RunAgentInput, next: AbstractAgent): ReturnType<AbstractAgent["run"]> {
    const last = input.messages.at(-1);
    let start = input.messages.length;
    if (last?.role === "user") {
      start -= 1;
    } else if (last?.role === "tool") {
      // A continuation can return several parallel tool results together.
      while (start > 0 && input.messages[start - 1]?.role === "tool") start -= 1;
    }
    return next.run({ ...input, messages: input.messages.slice(start) });
  }
}

const installed = new WeakSet<AbstractAgent>();

/** Install after middleware that needs the complete local conversation. */
export function installConversationOutgoingMessages(agent: AbstractAgent): void {
  if (installed.has(agent)) return;
  agent.use(new ConversationOutgoingMessages());
  installed.add(agent);
}
