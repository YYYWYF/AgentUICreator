import type {
  AgentApplicationEvent,
  AgentApplicationEventListener,
  AgentFrontendToolSource,
  AgentInterruptResponse,
  AgentRuntime,
  AgentRuntimeSnapshot,
  AgentUserInput,
} from "@agent-ui/runtime-core";
import type { AbstractAgent } from "@ag-ui/client";
import {
  ConversationRuntimeProvider as InternalConversationRuntimeProvider,
  type ConversationAgentFactory as InternalConversationAgentFactory,
} from "./ConversationRuntimeProvider.js";
import {
  useConversationRuntimeBridge as useInternalConversationRuntimeBridge,
  useConversationRuntimeObservation as useInternalConversationRuntimeObservation,
} from "./ConversationRuntimeBridgeContext.js";
import type { ConversationObservationSnapshot } from "./observation/types.js";
import type {
  ConversationLoadedThread,
  ConversationMessage,
  ConversationThreadBinding,
  ConversationThreadListItem,
  ConversationThreadListSnapshot,
} from "./threads/types.js";
import type { ConversationToolkit } from "@agent-ui/react";
import type { ReactNode } from "react";
import type { ConversationStarterSuggestion } from "./conversation-types.js";

export interface ConversationAgentFactoryConfig {
  endpoint: string;
  threadId: string;
}

export type ConversationAgentFactory = (
  config: ConversationAgentFactoryConfig,
) => AbstractAgent;

export interface ConversationRuntimeProviderProps<TState = unknown> {
  endpoint: string;
  threadBinding: ConversationThreadBinding<TState>;
  frontendTools?: AgentFrontendToolSource | undefined;
  toolkit?: ConversationToolkit | undefined;
  suggestions?: readonly ConversationStarterSuggestion[] | undefined;
  children: ReactNode;
  onError?: ((error: Error) => void) | undefined;
  unstable_agentFactory?: ConversationAgentFactory | undefined;
}

export function ConversationRuntimeProvider<TState = unknown>(
  props: Readonly<ConversationRuntimeProviderProps<TState>>,
) {
  return (
    <InternalConversationRuntimeProvider
      {...props}
      unstable_agentFactory={
        props.unstable_agentFactory as InternalConversationAgentFactory | undefined
      }
    />
  );
}

export interface ConversationRuntimeBridge<TState = unknown> {
  agentRuntime: ConversationAgentRuntimeBridge<TState>;
  applicationEvents: ConversationApplicationEventSource;
  observation: ConversationObservationSource;
  threadBinding: ConversationThreadBinding<TState>;
  frontendTools?: ConversationFrontendToolPort | undefined;
}

export function useConversationRuntimeBridge<TState = unknown>(): ConversationRuntimeBridge<TState> {
  return useInternalConversationRuntimeBridge<TState>() as unknown as ConversationRuntimeBridge<TState>;
}

export function useConversationRuntimeObservation(): ConversationObservationSnapshot {
  return useInternalConversationRuntimeObservation();
}

export interface ConversationAgentRuntimeBridge<TState = unknown>
  extends AgentRuntime<TState> {
  readonly observation: ConversationObservationSource;
  recordCancellation(): void;
  recordError(value: unknown): void;
}

export interface ConversationApplicationEventSource {
  start(): void;
  stop(): void;
  subscribe(listener: AgentApplicationEventListener): () => void;
}

export interface ConversationObservationSource {
  getSnapshot(): ConversationObservationSnapshot;
  subscribe(listener: () => void): () => void;
}

export interface ConversationFrontendToolPort {
  source: AgentFrontendToolSource;
  integrationPoint: "ConversationRuntime.frontendTools";
  status: "deferred";
}

export function createConversationFrontendToolPort(
  source: AgentFrontendToolSource,
): ConversationFrontendToolPort {
  return {
    source,
    integrationPoint: "ConversationRuntime.frontendTools",
    status: "deferred",
  };
}

export function createEphemeralConversationThreadBinding(): ConversationThreadBinding {
  let threadId = crypto.randomUUID();
  const listeners = new Set<() => void>();

  return {
    getThreadId: () => threadId,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async createNewThread() {
      threadId = crypto.randomUUID();
      for (const listener of listeners) listener();
      return threadId;
    },
  };
}

export type {
  ConversationStarterSuggestion,
} from "./conversation-types.js";

export type {
  ConversationLoadedThread,
  ConversationMessage,
  ConversationThreadBinding,
  ConversationThreadListItem,
  ConversationThreadListSnapshot,
} from "./threads/types.js";

export type {
  ConversationObservationSnapshot,
  ConversationToolCallObservation,
} from "./observation/types.js";

export { AgentUiRuntimeBusyError, UnsupportedAgentInputError } from "./errors.js";

export type {
  AgentInterruptResponse,
  AgentRuntimeSnapshot,
  AgentUserInput,
};
