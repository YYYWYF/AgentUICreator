import { Button, useConversationNavigation } from "@agent-ui/react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { useAgentUIThemeMode } from "../../agent-ui/theme/useAgentUITheme";
import { useAgentRun } from "../../runtime/context";
import {
  usePluginService,
  usePluginServiceSnapshot,
} from "../../runtime/plugins";
import {
  AGENT_UI_CONVERSATION_SERVICE,
  EMPTY_CONVERSATION_SNAPSHOT,
  type ConversationService,
} from "../../services/conversations";
import { useAgentUILocale } from "../../agent-ui/i18n/useAgentUILocale";
import { PolicyThreadList } from "./PolicyThreadList";

import "./styles.css";

export function ConversationThreadListPlugin(_props: UIPluginComponentProps) {
  const labels = useAgentUILocale("threadList");
  const conversationNavigation = useConversationNavigation();
  const theme = useAgentUIThemeMode();
  const run = useAgentRun();
  const conversation = usePluginService<ConversationService>(
    AGENT_UI_CONVERSATION_SERVICE,
  );
  const snapshot = usePluginServiceSnapshot(
    conversation,
    EMPTY_CONVERSATION_SNAPSHOT,
  );


  return (
    <aside
      className={[
        "conversation-thread-list-plugin agent-ui-conversation",
        theme === "dark" ? "dark" : undefined,
      ].filter(Boolean).join(" ")}
      data-agent-run-status={run.status}
      data-conversation-list-status={snapshot.listStatus}
      data-conversation-detail-status={snapshot.detailStatus}
      data-theme={theme}
      data-ui-plugin="conversation-thread-list"
    >
      <PolicyThreadList labels={labels} />

      {snapshot.listStatus === "error" ? (
        <div className="conversation-thread-list-error" role="alert">
          <strong>加载会话失败</strong>
          {snapshot.listError === undefined ? null : (
            <span>{snapshot.listError}</span>
          )}
          <Button
            disabled={conversation === undefined}
            onClick={() => {
              void conversation?.refresh();
            }}
            size="sm"
            variant="outline"
          >
            重试
          </Button>
        </div>
      ) : null}

      {snapshot.detailStatus === "error" ? (
        <div
          className="conversation-thread-list-error"
          data-slot="agent-ui-thread-detail-error"
          role="alert"
        >
          <strong>历史会话加载失败</strong>
          {snapshot.detailError === undefined ? null : (
            <span>{snapshot.detailError}</span>
          )}
          <Button
            disabled={
              conversation === undefined ||
              snapshot.detailErrorConversationId === undefined
            }
            onClick={() => {
              const failedConversationId = snapshot.detailErrorConversationId;
              if (failedConversationId === undefined) return;
              if (snapshot.activeConversationId === failedConversationId) {
                void conversationNavigation.reloadCurrentThread();
              } else {
                void conversationNavigation.switchToThread(failedConversationId);
              }
            }}
            size="sm"
            variant="outline"
          >
            重试
          </Button>
        </div>
      ) : null}
    </aside>
  );
}
