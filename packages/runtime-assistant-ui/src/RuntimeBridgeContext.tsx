import { createContext, useContext, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import type { AssistantUiAgentRuntimeBridge } from "./compatibility/agent-runtime-bridge.js";
import type { AssistantUiApplicationEventSource } from "./events/application-event-source.js";
import type { ConversationObservationSnapshot } from "./observation/types.js";
import type { AssistantUiThreadBinding } from "./threads/types.js";
import type { AssistantUiFrontendToolPort } from "./tools/types.js";

export interface AssistantUiRuntimeBridge<TState = unknown> {
  agentRuntime: AssistantUiAgentRuntimeBridge<TState>;
  applicationEvents: AssistantUiApplicationEventSource;
  observation: AssistantUiAgentRuntimeBridge<TState>["observation"];
  threadBinding: AssistantUiThreadBinding<TState>;
  frontendTools?: AssistantUiFrontendToolPort | undefined;
}

const RuntimeBridgeContext = createContext<AssistantUiRuntimeBridge | null>(null);

export function AssistantUiRuntimeBridgeProvider<TState = unknown>({
  bridge,
  children,
}: Readonly<{
  bridge: AssistantUiRuntimeBridge<TState>;
  children: ReactNode;
}>) {
  return (
    <RuntimeBridgeContext.Provider
      value={bridge as unknown as AssistantUiRuntimeBridge}
    >
      {children}
    </RuntimeBridgeContext.Provider>
  );
}

export function useAssistantUiRuntimeBridge<TState = unknown>(): AssistantUiRuntimeBridge<TState> {
  const bridge = useContext(RuntimeBridgeContext);
  if (bridge === null) {
    throw new Error(
      "useAssistantUiRuntimeBridge must be used within AssistantUiAgUiRuntimeProvider",
    );
  }
  return bridge as unknown as AssistantUiRuntimeBridge<TState>;
}

export function useAssistantUiRuntimeObservation(): ConversationObservationSnapshot {
  const { observation } = useAssistantUiRuntimeBridge();
  return useSyncExternalStore(
    observation.subscribe.bind(observation),
    observation.getSnapshot.bind(observation),
    observation.getSnapshot.bind(observation),
  );
}
