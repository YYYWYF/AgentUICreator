import { createContext, useLayoutEffect, useMemo, type ReactNode } from "react";
import { createSnapshotStore } from "../observation/snapshot-store.js";
import type { UIPluginObservableService } from "../contracts/index.js";
export interface ConversationComposerGuardState {
  awaitingReply: boolean;
  interruptKey: string;
}
const defaultStore = createSnapshotStore<ConversationComposerGuardState>({
  awaitingReply: false,
  interruptKey: "",
});
export const ConversationComposerGuardContext = createContext<UIPluginObservableService<ConversationComposerGuardState>>(defaultStore);
export function ConversationComposerGuardProvider({
  awaitingReply,
  interruptKey = "pending",
  children,
}: {
  awaitingReply: boolean;
  interruptKey?: string | undefined;
  children: ReactNode;
}) {
  const store = useMemo(() => createSnapshotStore({ awaitingReply, interruptKey }), []);
  useLayoutEffect(() => {
    const previous = store.getSnapshot();
    if (previous.awaitingReply !== awaitingReply || previous.interruptKey !== interruptKey) {
      store.publish({ awaitingReply, interruptKey });
    }
  }, [store, awaitingReply, interruptKey]);
  return (
    <ConversationComposerGuardContext.Provider value={store}>
      {children}
    </ConversationComposerGuardContext.Provider>
  );
}
