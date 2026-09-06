import { useMemo, useSyncExternalStore } from "react";

import type {
  AgentConversation,
  AgentExecution,
  AgentInterrupt,
  AgentInterruptResponse,
  AgentMessage,
  AgentRunState,
  AgentRuntimeSnapshot,
  AgentUserInput,
} from "@agent-ui/runtime-core";

import { useRequiredAgentRuntime } from "./AgentRuntimeContext";

function useAgentRuntimeSlice<TState, TValue>(
  select: (snapshot: AgentRuntimeSnapshot<TState>) => TValue,
): TValue {
  const runtime = useRequiredAgentRuntime<TState>();
  return useSyncExternalStore(
    runtime.subscribe,
    () => select(runtime.getSnapshot()),
    () => select(runtime.getSnapshot()),
  );
}

export function useAgentRuntimeSnapshot<TState = unknown>(): AgentRuntimeSnapshot<TState> {
  const runtime = useRequiredAgentRuntime<TState>();
  return useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot,
  );
}

export function useAgentConversation(): AgentConversation {
  return useAgentRuntimeSlice((snapshot) => snapshot.conversation);
}

export function useAgentMessages(): AgentMessage[] {
  return useAgentRuntimeSlice((snapshot) => snapshot.messages);
}

export function useAgentState<TState = unknown>(): TState {
  return useAgentRuntimeSlice<TState, TState>((snapshot) => snapshot.state);
}

export function useAgentRun(): AgentRunState {
  return useAgentRuntimeSlice((snapshot) => snapshot.run);
}

export function useAgentExecutions(): AgentExecution[] {
  return useAgentRuntimeSlice((snapshot) => snapshot.executions);
}

export function useAgentInterrupts(): AgentInterrupt[] {
  return useAgentRuntimeSlice((snapshot) => snapshot.interrupts);
}

export interface AgentRuntimeActions {
  sendMessage(input: string | AgentUserInput): Promise<void>;
  resumeInterrupts(responses: AgentInterruptResponse[]): Promise<void>;
  startNewConversation(): Promise<void>;
  abortRun(): void;
}

export function useAgentRuntimeActions(): AgentRuntimeActions {
  const runtime = useRequiredAgentRuntime();
  return useMemo(
    () => ({
      sendMessage: (input: string | AgentUserInput) => runtime.sendMessage(input),
      resumeInterrupts: (responses: AgentInterruptResponse[]) =>
        runtime.resumeInterrupts(responses),
      startNewConversation: () => runtime.startNewConversation(),
      abortRun: () => runtime.abort(),
    }),
    [runtime],
  );
}
