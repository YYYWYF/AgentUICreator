import { createContext, type ReactNode } from "react";
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
