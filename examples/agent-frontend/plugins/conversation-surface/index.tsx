import type { ReactNode } from "react";
import type { UIPluginComponentProps, UIPluginRenderScope } from "../../framework/contracts/ui-plugin";
import {
  ConversationAdapter,
  ConversationWelcomeFallback,
} from "../../agent-ui/conversation";
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
  renderScopedSlot,
}: UIPluginComponentProps) {
  const conversation = usePluginService<ConversationService>(
    AGENT_UI_CONVERSATION_SERVICE,
  );
  const snapshot = usePluginServiceSnapshot(
    conversation,
    EMPTY_CONVERSATION_SNAPSHOT,
  );
  const welcome = renderSlot("emptyWelcome", <ConversationWelcomeFallback />);
  const suggestions = renderSlot("emptySuggestions", null);
  const headerActions = renderSlot("headerActions", null);
  const composer = renderSlot("composer", null);
  const renderConversationScopedSlot = (
    slotName: string,
    scope: UIPluginRenderScope,
    fallback?: ReactNode,
  ): ReactNode => {
    switch (slotName) {
      case "reasoningGroup": return renderScopedSlot("reasoningGroup", scope, fallback);
      case "toolGroup": return renderScopedSlot("toolGroup", scope, fallback);
      case "toolFallback": return renderScopedSlot("toolFallback", scope, fallback);
      case "taskGroup": return renderScopedSlot("taskGroup", scope, fallback);
      case "assistantMessageFooter": return renderScopedSlot("assistantMessageFooter", scope, fallback);
      default: throw new Error(`Unknown Conversation renderer Slot "${slotName}"`);
    }
  };

  return (
    <div
      className="conversation-surface-plugin"
      data-conversation-detail-status={snapshot.detailStatus}
      data-conversation-mode={snapshot.mode}
      data-ui-plugin="conversation-surface"
    >
      <div
        className="conversation-surface-header-actions"
        data-conversation-surface-slot="headerActions"
      >
        {headerActions}
      </div>
      <ConversationAdapter
        welcome={welcome}
        suggestions={suggestions}
        composer={composer}
        renderScopedSlot={renderConversationScopedSlot}
      />
    </div>
  );
}
