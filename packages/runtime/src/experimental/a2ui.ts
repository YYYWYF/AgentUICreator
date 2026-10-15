/** Workspace-only A2UI action facade, excluded from npm delivery. */
import { useAgUiSendA2uiAction } from "@assistant-ui/react-ag-ui";
export type ConversationA2uiAction = Readonly<Record<string, unknown>>;

/** Native action continuation; must be called inside ConversationRuntimeProvider. */
export function useConversationA2uiAction(): (action: ConversationA2uiAction) => void {
  return useAgUiSendA2uiAction();
}
