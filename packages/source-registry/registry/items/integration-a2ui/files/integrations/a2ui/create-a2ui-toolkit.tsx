import { createConversationToolkit, type ConversationToolkit } from "@za38.03/agent-ui-plugins";
import type { GenerativeUILibrary } from "@za38.03/agent-ui-plugins/generative-ui";
/** Workspace-only placeholder; A2UI resources are not distributed. */
export function createA2uiConversationToolkit(_options: {
  sendAction(action: Record<string, unknown>): void;
  components?: GenerativeUILibrary;
}): ConversationToolkit {
  return createConversationToolkit({});
}
