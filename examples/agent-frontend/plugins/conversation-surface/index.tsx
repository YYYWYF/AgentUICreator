import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";

import "./styles.css";

export function ConversationSurfacePlugin({
  context,
  renderSlot,
}: UIPluginComponentProps) {
  const isEmpty = context.messages.length === 0;

  return (
    <main
      className="conversation-surface-plugin"
      data-conversation-state={isEmpty ? "empty" : "timeline"}
      data-ui-plugin="conversation-surface"
    >
      <section
        aria-label={isEmpty ? "会话开始" : "会话消息"}
        className={`conversation-surface-content conversation-surface-content--${
          isEmpty ? "empty" : "timeline"
        }`}
      >
        {isEmpty
          ? renderSlot("conversation.empty")
          : renderSlot("conversation.timeline")}
      </section>

      <footer className="conversation-surface-composer">
        {renderSlot("conversation.composer")}
      </footer>
    </main>
  );
}
