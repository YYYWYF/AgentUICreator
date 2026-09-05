import { useSyncExternalStore } from "react";

import type {
  AgentRuntime,
  AgentRuntimeSnapshot,
} from "@agent-ui/runtime-core";

export function useAgentRuntime<TState = unknown>(
  runtime: AgentRuntime<TState>,
): AgentRuntimeSnapshot<TState> {
  return useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot,
  );
}
