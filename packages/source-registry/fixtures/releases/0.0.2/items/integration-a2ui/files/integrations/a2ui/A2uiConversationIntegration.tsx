import { useMemo, type ReactNode } from "react";
import { ConversationToolkitProvider } from "@agent-ui/react";
import { useConversationA2uiAction } from "@agent-ui/runtime-conversation";
import { createA2uiConversationToolkit } from "./create-a2ui-toolkit";

export function A2uiConversationIntegration({ children }: { children: ReactNode }) {
  const sendAction = useConversationA2uiAction();
  const toolkit = useMemo(() => createA2uiConversationToolkit({ sendAction }), [sendAction]);
  return <ConversationToolkitProvider toolkit={toolkit}>{children}</ConversationToolkitProvider>;
}

export { A2uiConversationIntegration as ConversationIntegration };
