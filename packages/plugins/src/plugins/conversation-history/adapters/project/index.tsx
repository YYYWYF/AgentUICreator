import { CanonicalConversationHistory } from "@za38.03/agent-ui-plugins";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { usePluginService, usePluginServiceSnapshot } from "../../runtime/plugins";
import { AGENT_UI_CONVERSATION_SERVICE, EMPTY_CONVERSATION_SNAPSHOT, type ConversationService } from "../../services/conversations";
import "./styles.css";
export function ConversationHistoryPlugin(props: UIPluginComponentProps) {
  const conversation = usePluginService<ConversationService>(AGENT_UI_CONVERSATION_SERVICE);
  const snapshot = usePluginServiceSnapshot(conversation, EMPTY_CONVERSATION_SNAPSHOT);
  return <CanonicalConversationHistory activeConversationId={snapshot.activeConversationId} {...props} />;
}
