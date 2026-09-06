import { createContext, useContext } from "react";

import type { AgentRuntime } from "@agent-ui/runtime-core";

export const AgentRuntimeContext =
  createContext<AgentRuntime<unknown> | null>(null);

export function useRequiredAgentRuntime<TState = unknown>(): AgentRuntime<TState> {
  const runtime = useContext(AgentRuntimeContext);
  if (runtime === null) {
    throw new Error("AgentRuntimeProvider is missing");
  }
  return runtime as AgentRuntime<TState>;
}
