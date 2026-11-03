import { createContext, useContext, type PropsWithChildren } from "react";
export interface ConversationWelcomeConfig { title?: string; description?: string }
export interface ConversationPresentationConfig { welcome: ConversationWelcomeConfig }
const Context = createContext<ConversationPresentationConfig>({ welcome: {} });
export interface ConversationPresentationConfigProviderProps { value: ConversationPresentationConfig }
export function ConversationPresentationConfigProvider({ value, children }: PropsWithChildren<ConversationPresentationConfigProviderProps>) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useConversationPresentationConfig() { return useContext(Context); }
