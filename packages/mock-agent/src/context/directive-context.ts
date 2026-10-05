import type { Context, RunAgentInput } from "@ag-ui/core";
import { parseAgentUIDirectives, type AgentUIDirectiveReference } from "@agent-ui/runtime-core";

export interface DirectiveContextResolverOptions { signal: AbortSignal }
export type DirectiveContextResolver = (
  reference: AgentUIDirectiveReference,
  options: DirectiveContextResolverOptions,
) => Promise<Context | null>;

/** Rebuild business context from all canonical user text, without modifying the request. */
export async function resolveDirectiveContexts(
  input: RunAgentInput,
  resolvers: Readonly<Record<string, DirectiveContextResolver>>,
  options: DirectiveContextResolverOptions,
): Promise<RunAgentInput> {
  const context = [...input.context];
  const seen = new Set<string>();
  options.signal.throwIfAborted();
  for (const message of input.messages) {
    if (message.role !== "user") continue;
    const texts = typeof message.content === "string" ? [message.content]
      : message.content.filter(part => part.type === "text").map(part => part.text);
    for (const text of texts) {
      for (const segment of parseAgentUIDirectives(text)) {
        if (segment.kind !== "directive" || !Object.hasOwn(resolvers, segment.type)) continue;
        const key = JSON.stringify([segment.type, segment.id]);
        if (seen.has(key)) continue;
        seen.add(key);
        options.signal.throwIfAborted();
        const resolved = await resolvers[segment.type]!(
          { type: segment.type, label: segment.label, id: segment.id }, options,
        );
        options.signal.throwIfAborted();
        if (resolved !== null) context.push(resolved);
      }
    }
  }
  return { ...input, context };
}
