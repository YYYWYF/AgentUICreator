import { createContext, useContext, type ReactNode } from "react";

import type { AssistantUiConversationSlotId } from "./semantic-slots";

interface SemanticSlotFallbackValue {
  fallback: ReactNode;
  parent: SemanticSlotFallbackValue | null;
  slotId: AssistantUiConversationSlotId;
}

export interface SemanticSlotFallbackResult {
  available: boolean;
  fallback: ReactNode;
}

const SemanticSlotFallbackContext =
  createContext<SemanticSlotFallbackValue | null>(null);

export function SemanticSlotFallbackProvider({
  children,
  fallback,
  slotId,
}: {
  children: ReactNode;
  fallback: ReactNode;
  slotId: AssistantUiConversationSlotId;
}) {
  const parent = useContext(SemanticSlotFallbackContext);
  return (
    <SemanticSlotFallbackContext.Provider value={{ fallback, parent, slotId }}>
      {children}
    </SemanticSlotFallbackContext.Provider>
  );
}

export function useSemanticSlotFallback(
  slotId: AssistantUiConversationSlotId,
): SemanticSlotFallbackResult {
  let current = useContext(SemanticSlotFallbackContext);
  while (current !== null) {
    if (current.slotId === slotId) {
      return { available: true, fallback: current.fallback };
    }
    current = current.parent;
  }
  return { available: false, fallback: null };
}
