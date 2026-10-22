import { createContext, useContext, type ReactNode } from "react";
import type { ConversationCommandDecisionBinding } from "../public.js";

// Runtime owns pending commands and transport; fallback presentation only consumes them.
const CommandDecisionsContext = createContext<ReadonlyMap<string, ConversationCommandDecisionBinding>>(new Map());

export function ConversationCommandDecisionProvider({ decisions, children }: {
  decisions: ReadonlyMap<string, ConversationCommandDecisionBinding>;
  children: ReactNode;
}) {
  return <CommandDecisionsContext.Provider value={decisions}>{children}</CommandDecisionsContext.Provider>;
}

export function useConversationCommandDecision(toolCallId: string) {
  return useContext(CommandDecisionsContext).get(toolCallId);
}
