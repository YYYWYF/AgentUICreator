import type { ReactNode } from "react";
import type { GenerativeUILibrary } from "@za38.03/agent-ui-react/generative-ui";
/** Workspace-only placeholder; this resource is excluded from distribution. */
export function A2uiConversationIntegration({ children }: { children: ReactNode; components?: GenerativeUILibrary }) {
  return children;
}
export { A2uiConversationIntegration as ConversationIntegration };
