import { Middleware, type AbstractAgent, type RunAgentInput } from "@ag-ui/client";
import type { AgentUISendOptions } from "../host/threads.js";
import { snapshotAgentUIContext, type AgentUIContext } from "@za38.03/agent-ui-core";

const endpointKey = "__agentUIRequestEndpoint";
const ctxKey = "__agentUIRequestCtx";
type RunConfig = { readonly custom?: Record<string, unknown> };

/** Local send metadata follows native runConfig; private keys never reach the wire. */
export function withConversationSendOptions<T extends RunConfig>(config: T, options?: AgentUISendOptions): T {
  const endpoint = options?.endpoint;
  if (endpoint !== undefined && (!endpoint.trim() || endpoint !== endpoint.trim())) throw new Error("AGENT_UI_INVALID_ENDPOINT");
  const ctx = snapshotAgentUIContext(options?.ctx);
  if (endpoint === undefined && ctx === undefined) return config;
  return { ...config, custom: { ...config.custom,
    ...(endpoint === undefined ? {} : { [endpointKey]: endpoint }),
    ...(ctx === undefined ? {} : { [ctxKey]: ctx }),
  } };
}

/** Restore only this send's routing fields, retaining concurrent draft changes. */
export function restoreConversationSendOptions<T extends RunConfig>(current: T, submitted: T, original: T): T {
  if (current === submitted) return original;
  const custom = { ...current.custom };
  let changed = false;
  for (const key of [endpointKey, ctxKey]) {
    if (submitted.custom?.[key] === original.custom?.[key] || current.custom?.[key] !== submitted.custom?.[key]) continue;
    if (original.custom && Object.hasOwn(original.custom, key)) custom[key] = original.custom[key];
    else delete custom[key];
    changed = true;
  }
  return changed ? { ...current, custom } : current;
}

/** One routing adapter per native Thread; messages/state remain upstream-owned. */
export class ConversationRequestRouting extends Middleware {
  private readonly endpoints = new Map<string, string>();
  private currentEndpoint: string;
  private readonly contexts = new Map<string, AgentUIContext | undefined>();
  private currentCtx: AgentUIContext | undefined;
  constructor(private readonly defaultEndpoint: string, private readonly getCtx: () => AgentUIContext | undefined = () => undefined) {
    super();
    this.currentEndpoint = defaultEndpoint;
  }
  getEndpoint = () => this.currentEndpoint;

  override run(input: RunAgentInput, next: AbstractAgent): ReturnType<AbstractAgent["run"]> {
    const props = input.forwardedProps as Record<string, unknown> | undefined;
    const config = props?.runConfig as Record<string, unknown> | undefined;
    const requested = config?.[endpointKey];
    const requestedCtx = config?.[ctxKey] as AgentUIContext | undefined;
    const userId = [...input.messages].reverse().find(message => message.role === "user")?.id;
    const continuation = "resume" in input || props?.command !== undefined || input.messages.at(-1)?.role === "tool";
    const turnCtx = requestedCtx !== undefined ? snapshotAgentUIContext(requestedCtx)
      : userId !== undefined && this.contexts.has(userId) ? this.contexts.get(userId)
      : continuation ? this.currentCtx : undefined;
    const ctx = { ...snapshotAgentUIContext(this.getCtx()), ...turnCtx };
    this.currentEndpoint = typeof requested === "string" ? requested
      : (userId === undefined ? undefined : this.endpoints.get(userId))
        ?? (continuation ? this.currentEndpoint : this.defaultEndpoint);
    if (userId !== undefined) this.endpoints.set(userId, this.currentEndpoint);
    this.currentCtx = turnCtx;
    if (userId !== undefined) this.contexts.set(userId, turnCtx);
    const hasCtx = Object.keys(ctx).length > 0;
    if (requested === undefined && requestedCtx === undefined && !hasCtx) return next.run(input);
    const { [endpointKey]: _local, [ctxKey]: _ctx, ...custom } = config ?? {};
    const { runConfig: _config, ...forwardedProps } = props ?? {};
    return next.run({ ...input, forwardedProps: {
      ...forwardedProps, ...(Object.keys(custom).length ? { runConfig: custom } : {}),
      ...(hasCtx ? { ctx } : {}),
    } });
  }
}
