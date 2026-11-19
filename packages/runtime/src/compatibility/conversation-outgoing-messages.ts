import { Middleware, type AbstractAgent, type RunAgentInput } from '@ag-ui/client';
import type { AssistantRuntime, ThreadMessage } from '@assistant-ui/react';
import type { ConversationInputController } from '../plugin-api/input-controller.js';

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/** Native per-send configuration follows the Host's public ctx envelope. */
function normalizeNativeRequest(input: RunAgentInput): RunAgentInput {
  const props = record(input.forwardedProps);
  const config = record(props?.runConfig);
  if (!config || !props) return input;
  const { runConfig: _native, ...forwardedProps } = props;
  const ctx = { ...config, ...record(forwardedProps.ctx) };
  return { ...input, forwardedProps: { ...forwardedProps, ...(Object.keys(ctx).length ? { ctx } : {}) } };
}

/** History stays upstream; applications may transform the outgoing request. */
class ConversationOutgoingMessages extends Middleware {
  constructor(private readonly controller?: ConversationInputController,
    private readonly threadId = '',
    private readonly getNative?: () => AssistantRuntime | undefined,
    private readonly getSubmitted?: () => readonly ThreadMessage[]) { super(); }
  override run(input: RunAgentInput, next: AbstractAgent): ReturnType<AbstractAgent['run']> {
    const last = input.messages.at(-1);
    let start = input.messages.length;
    if (last?.role === 'user') start -= 1;
    else if (last?.role === 'tool') {
      while (start > 0 && input.messages[start - 1]?.role === 'tool') start -= 1;
    }
    const outgoing = { ...input, messages: input.messages.slice(start) };
    return next.run(this.controller ? this.controller.transformRequest(outgoing, {
      threadId: this.threadId,
      runtime: this.getNative?.(),
      submittedMessages: this.getSubmitted?.() ?? [],
    }) : normalizeNativeRequest(outgoing));
  }
}
const installed = new WeakSet<AbstractAgent>();
export function installConversationOutgoingMessages(agent: AbstractAgent, controller?: ConversationInputController, threadId = '',
  getNative?: () => AssistantRuntime | undefined, getSubmitted?: () => readonly ThreadMessage[]): void {
  if (installed.has(agent)) return;
  agent.use(new ConversationOutgoingMessages(controller, threadId, getNative, getSubmitted));
  installed.add(agent);
}
