import { useSyncExternalStore } from "react";

import type {
  AgentRuntimeSnapshot,
  AgentRuntime,
} from "./agent-runtime";

export function useAgentRuntime(
  runtime: AgentRuntime,
): AgentRuntimeSnapshot {
  return useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot,
  );
}
