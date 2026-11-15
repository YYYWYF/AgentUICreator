export type AgentUIContextValue =
  | string | number | boolean | null
  | readonly AgentUIContextValue[]
  | { readonly [key: string]: AgentUIContextValue };

/** JSON business parameters carried in AG-UI forwardedProps.ctx. */
// Accept ordinary business interfaces; validate their values when snapshotting.
export type AgentUIContext = Readonly<Record<string, unknown>>;

export interface AgentSendOptions {
  /** Shallow overrides for this user turn, including retries and continuations. */
  ctx?: AgentUIContext | undefined;
}

export class InvalidAgentUIContextError extends Error {
  readonly code = "AGENT_UI_INVALID_CTX";
  constructor() {
    super("AGENT_UI_INVALID_CTX");
    this.name = "InvalidAgentUIContextError";
  }
}

/** Validate without lossy JSON coercion and detach caller-owned objects. */
export function snapshotAgentUIContext(ctx: AgentUIContext | undefined): AgentUIContext | undefined {
  if (ctx === undefined) return undefined;
  const ancestors = new Set<object>();
  function copy(value: unknown): AgentUIContextValue {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "object" || value === null || ancestors.has(value)) throw new InvalidAgentUIContextError();
    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) throw new InvalidAgentUIContextError();
    if (Object.getOwnPropertySymbols(value).length) throw new InvalidAgentUIContextError();
    ancestors.add(value);
    try {
      return Array.isArray(value)
        ? Array.from(value, item => copy(item))
        : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
    } finally { ancestors.delete(value); }
  }
  if (ctx === null || typeof ctx !== "object" || Array.isArray(ctx)) throw new InvalidAgentUIContextError();
  return copy(ctx) as AgentUIContext;
}
