import {
  createContext,
  useContext,
  type PropsWithChildren,
} from "react";

import type { ConversationPresentationConfig } from "./conversation-presentation-config";

const EMPTY_CONVERSATION_PRESENTATION_CONFIG: ConversationPresentationConfig = {
  welcome: {},
};

const ConversationPresentationConfigContext =
  createContext<ConversationPresentationConfig>(
    EMPTY_CONVERSATION_PRESENTATION_CONFIG,
  );

export interface ConversationPresentationConfigProviderProps {
  value: ConversationPresentationConfig;
}

export function ConversationPresentationConfigProvider({
  children,
  value,
}: PropsWithChildren<ConversationPresentationConfigProviderProps>) {
  return (
    <ConversationPresentationConfigContext.Provider value={value}>
      {children}
    </ConversationPresentationConfigContext.Provider>
  );
}

export function useConversationPresentationConfig(): ConversationPresentationConfig {
  return useContext(ConversationPresentationConfigContext);
}
