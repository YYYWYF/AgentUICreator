import { createContext, useContext, type ReactNode } from "react";
export interface ConversationComposerGuardState {
  awaitingReply: boolean;
  interruptKey: string;
}
export const ConversationComposerGuardContext = createContext<ConversationComposerGuardState>({
  awaitingReply: false,
  interruptKey: "",
});
export function ConversationComposerGuardProvider({
  awaitingReply,
  interruptKey = "pending",
  children,
}: {
  awaitingReply: boolean;
  interruptKey?: string | undefined;
  children: ReactNode;
}) {
  return (
    <ConversationComposerGuardContext.Provider value={{ awaitingReply, interruptKey }}>
      {children}
    </ConversationComposerGuardContext.Provider>
  );
}

export const useConversationComposerGuardState = () => useContext(ConversationComposerGuardContext);
export const useConversationComposerAwaitingReply = () => useContext(ConversationComposerGuardContext).awaitingReply;
