import { Middleware, type AbstractAgent, type RunAgentInput } from '@ag-ui/client';
import type { AssistantRuntime, ThreadMessage } from '@assistant-ui/react';
import type { ConversationRequestPartsRuntime, ConversationRequestPlan } from '../conversation-support/conversation-request-parts.js';

/** History stays upstream; Plugin request contributions follow the submitted turn. */
class ConversationOutgoingMessages extends Middleware {
  private plan: ConversationRequestPlan | undefined;
  constructor(private readonly parts?: ConversationRequestPartsRuntime,
    private readonly getNative?: () => AssistantRuntime | undefined,
    private readonly getSubmitted?: () => readonly ThreadMessage[]) { super(); }
  override run(input: RunAgentInput, next: AbstractAgent): ReturnType<AbstractAgent['run']> {
    const last = input.messages.at(-1);
    let start = input.messages.length;
    if (last?.role === 'user') start -= 1;
    else if (last?.role === 'tool') {
      while (start > 0 && input.messages[start - 1]?.role === 'tool') start -= 1;
    }
    const continuation = 'resume' in input || last?.role === 'tool' ||
      (typeof input.forwardedProps === 'object' && input.forwardedProps !== null && 'command' in input.forwardedProps);
    if (this.parts && (!continuation || !this.plan)) {
      const native = this.getNative?.()?.thread.getState().messages ?? [];
      const submitted = this.getSubmitted?.() ?? [];
      const userId = [...input.messages].reverse().find(message => message.role === 'user')?.id;
      // An attachment/queue dispatch can start before React publishes the native
      // projection. The history adapter already holds the exact submitted message.
      const user = userId ? [...submitted, ...native].find(message => message.role === 'user' && message.id === userId)
        : [...native].reverse().find(message => message.role === 'user');
      // Build only after successful callbacks, so a failed submission can be retried.
      this.plan = user ? this.parts.prepare(user, continuation ? undefined : input) : undefined;
    }
    const outgoing = { ...input, messages: input.messages.slice(start) };
    return next.run(this.parts && this.plan ? this.parts.apply(outgoing, this.plan) : outgoing);
  }
}
const installed = new WeakSet<AbstractAgent>();
export function installConversationOutgoingMessages(agent: AbstractAgent, parts?: ConversationRequestPartsRuntime,
  getNative?: () => AssistantRuntime | undefined, getSubmitted?: () => readonly ThreadMessage[]): void {
  if (installed.has(agent)) return;
  agent.use(new ConversationOutgoingMessages(parts, getNative, getSubmitted));
  installed.add(agent);
}
