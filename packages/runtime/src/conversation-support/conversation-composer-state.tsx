import { createContext, useContext, type ReactNode } from "react";
export interface ConversationComposerGuardState {
  awaitingReply: boolean;
  interruptKey: string;
}
const Context = createContext<ConversationComposerGuardState>({
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
    <Context.Provider value={{ awaitingReply, interruptKey }}>
      {children}
    </Context.Provider>
  );
}
export const useConversationComposerGuardState = () => useContext(Context);
export const useConversationComposerAwaitingReply = () =>
  useContext(Context).awaitingReply;
