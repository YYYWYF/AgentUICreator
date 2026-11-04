import type { Context, RunAgentInput } from "@ag-ui/core";
import { type AgentUIDirectiveReference } from "@za38.03/agent-ui-core";
export interface DirectiveContextResolverOptions {
    signal: AbortSignal;
}
export type DirectiveContextResolver = (reference: AgentUIDirectiveReference, options: DirectiveContextResolverOptions) => Promise<Context | null>;
/** Rebuild business context from all canonical user text, without modifying the request. */
export declare function resolveDirectiveContexts(input: RunAgentInput, resolvers: Readonly<Record<string, DirectiveContextResolver>>, options: DirectiveContextResolverOptions): Promise<RunAgentInput>;
//# sourceMappingURL=directive-context.d.ts.map