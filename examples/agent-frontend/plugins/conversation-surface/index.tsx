import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import {
  AGENT_UI_CONVERSATION_SERVICE,
  getVisibleConversationMessages,
} from "../../services/conversations";

import "./styles.css";

export function ConversationSurfacePlugin({
  context,
  renderSlot,
}: UIPluginComponentProps) {
  const conversation = context.services.get(
    AGENT_UI_CONVERSATION_SERVICE,
  );
  const visibleMessages = getVisibleConversationMessages(
    context.messages,
    conversation,
  );
  const showTimeline =
    context.run.status === "running" || visibleMessages.length > 0;

  return (
    <main
      className="conversation-surface-plugin"
      data-conversation-state={showTimeline ? "timeline" : "empty"}
      data-ui-plugin="conversation-surface"
    >
      <section
        aria-label={showTimeline ? "会话消息" : "会话开始"}
        className={`conversation-surface-content conversation-surface-content--${
          showTimeline ? "timeline" : "empty"
        }`}
      >
        {showTimeline
          ? renderSlot("conversation.timeline")
          : renderSlot("conversation.empty")}
      </section>

      <footer className="conversation-surface-composer">
        {renderSlot("conversation.composer")}
      </footer>
    </main>
  );
}
