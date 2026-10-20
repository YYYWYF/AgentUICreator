import { ConversationHistoryPlugin as Implementation } from "@za38.03/agent-ui-plugins/conversation-history";
import type { ComponentProps } from "react";
import { usePluginService, usePluginServiceSnapshot } from "../../runtime/plugins";
import { AGENT_UI_CONVERSATION_SERVICE, EMPTY_CONVERSATION_SNAPSHOT, type ConversationService } from "../../services/conversations";

export function ConversationHistoryPlugin(props: ComponentProps<typeof Implementation>) {
  const conversation = usePluginService<ConversationService>(AGENT_UI_CONVERSATION_SERVICE);
  const snapshot = usePluginServiceSnapshot(conversation, EMPTY_CONVERSATION_SNAPSHOT);
  return <Implementation activeConversationId={snapshot.activeConversationId} {...props} />;
}
