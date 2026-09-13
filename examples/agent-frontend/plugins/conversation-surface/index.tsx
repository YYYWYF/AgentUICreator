import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { AssistantUiConversationAdapter } from "../../agent-ui/adapters/assistant-ui/conversation";
import {
  AGENT_UI_CONVERSATION_SERVICE,
  EMPTY_CONVERSATION_SNAPSHOT,
  type ConversationService,
} from "../../services/conversations";
import {
  usePluginService,
  usePluginServiceSnapshot,
} from "../../runtime/plugins";
import "./styles.css";

export function ConversationSurfacePlugin({
  renderSlot,
}: UIPluginComponentProps) {
  const conversation = usePluginService<ConversationService>(
    AGENT_UI_CONVERSATION_SERVICE,
  );
  const snapshot = usePluginServiceSnapshot(
    conversation,
    EMPTY_CONVERSATION_SNAPSHOT,
  );

  return (
    <div
      className="conversation-surface-plugin"
      data-conversation-detail-status={snapshot.detailStatus}
      data-conversation-mode={snapshot.mode}
      data-ui-plugin="conversation-surface"
    >
      <AssistantUiConversationAdapter renderSlot={renderSlot} />
    </div>
  );
}
