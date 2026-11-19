import type { RunAgentInput } from "@ag-ui/client";

/** Request draft before the Runtime fills missing protocol identities. */
export type AgentUIRequestInput = Omit<RunAgentInput, "threadId" | "runId" | "state" | "forwardedProps"> & {
  threadId?: string | undefined;
  runId?: string | undefined;
  state?: unknown;
  forwardedProps: Record<string, unknown>;
};

export type AgentUIRequestPatch = Partial<AgentUIRequestInput>;

/** Runs for every outgoing AG-UI request, after application request adaptation. */
export type AgentUIBeforeRequest = (
  input: AgentUIRequestInput,
  options: { signal: AbortSignal },
) => AgentUIRequestPatch | void | Promise<AgentUIRequestPatch | void>;
