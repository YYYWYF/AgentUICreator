import { useSyncExternalStore } from "react";

import type {
  AgentRuntimeSnapshot,
  AgentRuntimeTransport,
} from "./AgentRuntime";

export function useAgentRuntime(
  runtime: AgentRuntimeTransport,
): AgentRuntimeSnapshot {
  return useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot,
  );
}
