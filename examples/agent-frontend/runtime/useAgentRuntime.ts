import { useSyncExternalStore } from "react";

import type {
  AgentRuntime,
  AgentRuntimeSnapshot,
} from "@agent-ui/runtime-core";

export function useAgentRuntime(runtime: AgentRuntime): AgentRuntimeSnapshot {
  return useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot,
  );
}
