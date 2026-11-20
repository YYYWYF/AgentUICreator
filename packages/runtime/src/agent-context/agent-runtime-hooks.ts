import { useMemo } from "react";
import type { AgentRuntime, AgentRuntimeSnapshot } from "@za38.03/agent-ui-core";
import { useRequiredAgentRuntime } from "./AgentRuntimeContext.js";
import { useStoreValue } from "../observation/use-store-value.js";

export type AgentRuntimeController<TState = unknown> = Omit<AgentRuntime<TState>, "dispose" | "abort"> & {
  abortRun(): void;
};

export function useAgentRuntime<TState = unknown>(): AgentRuntimeController<TState>;
export function useAgentRuntime<TValue, TState = unknown>(selector: (snapshot: AgentRuntimeSnapshot<TState>) => TValue): TValue;
export function useAgentRuntime<TValue, TState = unknown>(selector: ((snapshot: AgentRuntimeSnapshot<TState>) => TValue) | undefined): AgentRuntimeController<TState> | TValue;
export function useAgentRuntime<TValue, TState = unknown>(
  selector?: (snapshot: AgentRuntimeSnapshot<TState>) => TValue,
): AgentRuntimeController<TState> | TValue {
  const runtime = useRequiredAgentRuntime<TState>();
  const controller = useMemo<AgentRuntimeController<TState>>(() => ({
    mode: runtime.mode,
    getSnapshot: () => runtime.getSnapshot(),
    subscribe: listener => runtime.subscribe(listener),
    subscribeApplicationEvents: listener => runtime.subscribeApplicationEvents(listener),
    sendMessage: (input, options) => options === undefined ? runtime.sendMessage(input) : runtime.sendMessage(input, options),
    resumeInterrupts: responses => runtime.resumeInterrupts(responses),
    startNewConversation: () => runtime.startNewConversation(),
    abortRun: () => runtime.abort(),
  }), [runtime]);
  return useStoreValue(runtime.subscribe, () => selector === undefined ? controller : selector(runtime.getSnapshot()), selector !== undefined);
}

export type AgentRuntimeActions = Pick<AgentRuntimeController, 'sendMessage' | 'resumeInterrupts' | 'startNewConversation' | 'abortRun'>;
