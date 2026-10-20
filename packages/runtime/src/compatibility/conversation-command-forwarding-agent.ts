import {
  Middleware,
  type AbstractAgent,
  type RunAgentInput,
} from "@ag-ui/client";

export interface ConversationCommandForwardedProps {
  decisions: readonly { type: string }[];
}

export interface ConversationCommandForwarder {
  setNextCommand(command: ConversationCommandForwardedProps): void;
  clearNextCommand(): void;
}

class ConversationCommandForwardingMiddleware extends Middleware implements ConversationCommandForwarder {
  private nextCommand: ConversationCommandForwardedProps | undefined;

  setNextCommand(command: ConversationCommandForwardedProps): void {
    if (this.nextCommand !== undefined) {
      throw new Error("A command decision is already queued for this conversation");
    }
    this.nextCommand = structuredClone(command);
  }

  clearNextCommand(): void {
    this.nextCommand = undefined;
  }

  override run(input: RunAgentInput, next: AbstractAgent): ReturnType<AbstractAgent["run"]> {
    const command = this.nextCommand;
    this.nextCommand = undefined;
    if (command === undefined) return next.run(input);
    return next.run({
      ...input,
      forwardedProps: {
        ...input.forwardedProps,
        command,
      },
    });
  }
}

const installed = new WeakMap<AbstractAgent, ConversationCommandForwardingMiddleware>();

/** Inject one decision command into exactly the next AG-UI request. */
export function installConversationCommandForwarding(
  agent: AbstractAgent,
): ConversationCommandForwarder {
  const existing = installed.get(agent);
  if (existing !== undefined) return existing;
  const middleware = new ConversationCommandForwardingMiddleware();
  agent.use(middleware);
  installed.set(agent, middleware);
  return middleware;
}
