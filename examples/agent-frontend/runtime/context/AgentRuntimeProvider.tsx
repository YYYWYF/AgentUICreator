import type { ReactNode } from "react";

import type { AgentRuntime } from "@agent-ui/runtime-core";

import { AgentRuntimeContext } from "./AgentRuntimeContext";

export interface AgentRuntimeProviderProps<TState = unknown> {
  runtime: AgentRuntime<TState>;
  children: ReactNode;
}

export function AgentRuntimeProvider<TState = unknown>({
  runtime,
  children,
}: AgentRuntimeProviderProps<TState>) {
  return (
    <AgentRuntimeContext.Provider value={runtime as AgentRuntime<unknown>}>
      {children}
    </AgentRuntimeContext.Provider>
  );
}
