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
  const renderConversationScopedSlot = (
    slotName: string,
    scope: UIPluginRenderScope,
  ): ReactNode => {
    switch (slotName) {
      case "reasoningGroup": return renderScopedSlot("reasoningGroup", scope);
      case "toolGroup": return renderScopedSlot("toolGroup", scope);
      case "toolFallback": return renderScopedSlot("toolFallback", scope);
      case "assistantMessageFooter": return renderScopedSlot("assistantMessageFooter", scope);
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
      <ConversationAdapter welcome={welcome} suggestions={suggestions} renderScopedSlot={renderConversationScopedSlot} />
    </div>
  );
}
