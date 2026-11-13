import { Middleware, type AbstractAgent, type RunAgentInput } from "@ag-ui/client";
import type { AgentUISendOptions } from "../host/threads.js";

const endpointKey = "__agentUIRequestEndpoint";
type RunConfig = { readonly custom?: Record<string, unknown> };

/** Local transport selection travels with the native send, never in AG-UI data. */
export function withConversationEndpoint<T extends RunConfig>(config: T, options?: AgentUISendOptions): T {
  if (options?.endpoint === undefined) return config;
  const endpoint = options.endpoint;
  if (!endpoint.trim() || endpoint !== endpoint.trim()) throw new Error("AGENT_UI_INVALID_ENDPOINT");
  return { ...config, custom: { ...config.custom, [endpointKey]: endpoint } };
}

/** One routing adapter per native Thread; messages/state remain upstream-owned. */
export class ConversationRequestRouting extends Middleware {
  private readonly endpoints = new Map<string, string>();
  private currentEndpoint: string;
  constructor(private readonly defaultEndpoint: string) {
    super();
    this.currentEndpoint = defaultEndpoint;
  }
  getEndpoint = () => this.currentEndpoint;

  override run(input: RunAgentInput, next: AbstractAgent): ReturnType<AbstractAgent["run"]> {
    const props = input.forwardedProps as Record<string, unknown> | undefined;
    const config = props?.runConfig as Record<string, unknown> | undefined;
    const requested = config?.[endpointKey];
    const userId = [...input.messages].reverse().find(message => message.role === "user")?.id;
    const continuation = "resume" in input || props?.command !== undefined || input.messages.at(-1)?.role === "tool";
    this.currentEndpoint = typeof requested === "string" ? requested
      : (userId === undefined ? undefined : this.endpoints.get(userId))
        ?? (continuation ? this.currentEndpoint : this.defaultEndpoint);
    if (userId !== undefined) this.endpoints.set(userId, this.currentEndpoint);
    if (requested === undefined) return next.run(input);
    const { [endpointKey]: _local, ...custom } = config ?? {};
    const { runConfig: _config, ...forwardedProps } = props ?? {};
    return next.run({ ...input, forwardedProps: {
      ...forwardedProps, ...(Object.keys(custom).length ? { runConfig: custom } : {}),
    } });
  }
}
