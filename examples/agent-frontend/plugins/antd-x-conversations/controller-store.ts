import { useSyncExternalStore } from "react";

import type { AgentUIConversationService } from "../../services/conversations";

const controllers = new Map<string, AgentUIConversationService>();
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function bindConversationController(
  instanceId: string,
  controller: AgentUIConversationService,
): () => void {
  controllers.set(instanceId, controller);
  emit();
  return () => {
    if (controllers.get(instanceId) === controller) {
      controllers.delete(instanceId);
      emit();
    }
  };
}

export function useConversationController(
  instanceId: string,
): AgentUIConversationService | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => controllers.get(instanceId),
    () => controllers.get(instanceId),
  );
}
