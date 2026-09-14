import { createContext, useContext, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import type { ConversationAgentRuntimeBridge } from "./compatibility/conversation-runtime-bridge.js";
import type { ConversationApplicationEventSource } from "./events/conversation-application-event-source.js";
import type { ConversationObservationSnapshot } from "./observation/types.js";
import type { ConversationThreadBinding } from "./threads/types.js";
import type { ConversationFrontendToolPort } from "./tools/types.js";

export interface ConversationRuntimeBridge<TState = unknown> {
  agentRuntime: ConversationAgentRuntimeBridge<TState>;
  applicationEvents: ConversationApplicationEventSource;
  observation: ConversationAgentRuntimeBridge<TState>["observation"];
  threadBinding: ConversationThreadBinding<TState>;
  frontendTools?: ConversationFrontendToolPort | undefined;
}

const RuntimeBridgeContext = createContext<ConversationRuntimeBridge | null>(null);

export function ConversationRuntimeBridgeProvider<TState = unknown>({
  bridge,
  children,
}: Readonly<{
  bridge: ConversationRuntimeBridge<TState>;
  children: ReactNode;
}>) {
  return (
    <RuntimeBridgeContext.Provider
      value={bridge as unknown as ConversationRuntimeBridge}
    >
      {children}
    </RuntimeBridgeContext.Provider>
  );
}

export function useConversationRuntimeBridge<TState = unknown>(): ConversationRuntimeBridge<TState> {
  const bridge = useContext(RuntimeBridgeContext);
  if (bridge === null) {
    throw new Error(
      "useConversationRuntimeBridge must be used within ConversationRuntimeProvider",
    );
  }
  return bridge as unknown as ConversationRuntimeBridge<TState>;
}

export function useConversationRuntimeObservation(): ConversationObservationSnapshot {
  const { observation } = useConversationRuntimeBridge();
  return useSyncExternalStore(
    observation.subscribe.bind(observation),
    observation.getSnapshot.bind(observation),
    observation.getSnapshot.bind(observation),
  );
}
