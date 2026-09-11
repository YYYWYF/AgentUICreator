import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { useAgentMessages, useAgentRun } from "../../runtime/context";
import {
  usePluginService,
  usePluginServiceSnapshot,
} from "../../runtime/plugins";
import {
  AGENT_UI_CONVERSATION_SERVICE,
  EMPTY_CONVERSATION_SNAPSHOT,
  getVisibleConversationMessages,
  type AgentUIConversationService,
} from "../../services/conversations";

import "./styles.css";

export function ConversationSurfacePlugin({
  renderSlot,
}: UIPluginComponentProps) {
  const messages = useAgentMessages();
  const run = useAgentRun();
  const conversation = usePluginService<AgentUIConversationService>(
    AGENT_UI_CONVERSATION_SERVICE,
  );
  const conversationSnapshot = usePluginServiceSnapshot(
    conversation,
    EMPTY_CONVERSATION_SNAPSHOT,
  );
  const visibleMessages = getVisibleConversationMessages(
    messages,
    conversationSnapshot,
  );
  const showTimeline =
    conversationSnapshot.mode === "history" ||
    run.status === "running" ||
    visibleMessages.length > 0;

  return (
    <main
      className="conversation-surface-plugin"
      data-conversation-mode={conversationSnapshot.mode}
      data-conversation-state={showTimeline ? "timeline" : "empty"}
      data-ui-plugin="conversation-surface"
    >
      <section
        aria-label={showTimeline ? "会话消息" : "会话开始"}
        className={`conversation-surface-content conversation-surface-content--${
          showTimeline ? "timeline" : "empty"
        }`}
      >
        {showTimeline ? (
          renderSlot("conversation.timeline")
        ) : (
          <div
            className="conversation-surface-empty"
            data-slot="conversation-empty"
          >
            <div
              className="conversation-surface-empty-welcome"
              data-slot="conversation-empty-welcome"
            >
              {renderSlot("conversation.empty.welcome")}
            </div>

            <div
              className="conversation-surface-empty-suggestions"
              data-slot="conversation-empty-suggestions"
            >
              {renderSlot("conversation.empty.suggestions")}
            </div>
          </div>
        )}
      </section>

      <footer className="conversation-surface-composer">
        {renderSlot("conversation.composer")}
      </footer>
    </main>
  );
}
