import { usePluginService, usePluginServiceSnapshot } from "@za38.03/agent-ui-plugins";
import {
  AGENT_UI_CONVERSATION_SERVICE,
  EMPTY_CONVERSATION_SNAPSHOT,
  type ConversationService,
} from "../conversations";

/** Passive observation needs only the shared service context, not an assistant Runtime. */
export function useConversations() {
  const service = usePluginService<ConversationService>(AGENT_UI_CONVERSATION_SERVICE);
  const snapshot = usePluginServiceSnapshot(service, EMPTY_CONVERSATION_SNAPSHOT);
  return { snapshot, serviceAvailable: service !== undefined };
}
