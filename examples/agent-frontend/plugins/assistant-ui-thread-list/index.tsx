import { ThreadList } from "../../agent-ui/vendor/assistant-ui/components/assistant-ui/elements/thread-list.aui.tsx";
import { useAui } from "@assistant-ui/react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { useAgentRun } from "../../runtime/context";
import {
  usePluginService,
  usePluginServiceSnapshot,
} from "../../runtime/plugins";
import {
  AGENT_UI_CONVERSATION_SERVICE,
  EMPTY_CONVERSATION_SNAPSHOT,
  type AgentUIConversationService,
} from "../../services/conversations";
import { Button } from "../../agent-ui/primitives/button";

import "./styles.css";

export function AssistantUiThreadListPlugin(_props: UIPluginComponentProps) {
  const aui = useAui();
  const run = useAgentRun();
  const conversation = usePluginService<AgentUIConversationService>(
    AGENT_UI_CONVERSATION_SERVICE,
  );
  const snapshot = usePluginServiceSnapshot(
    conversation,
    EMPTY_CONVERSATION_SNAPSHOT,
  );
  const navigationLocked =
    run.status === "running" || run.status === "awaiting-input";

  return (
    <aside
      className="assistant-ui-thread-list-plugin agent-ui-assistant-ui dark"
      data-agent-run-status={run.status}
      data-conversation-list-status={snapshot.listStatus}
      data-conversation-detail-status={snapshot.detailStatus}
      data-theme="dark"
      data-ui-plugin="assistant-ui-thread-list"
    >
      <ThreadList
        policy={{
          disableNavigation: navigationLocked,
          showItemActions: false,
          isItemDisabled: ({ custom }) => custom?.agentUiDisabled === true,
        }}
      />

      {snapshot.listStatus === "error" ? (
        <div className="assistant-ui-thread-list-error" role="alert">
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
          className="assistant-ui-thread-list-error"
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
              snapshot.detailErrorConversationId === undefined ||
              navigationLocked
            }
            onClick={() => {
              const failedConversationId = snapshot.detailErrorConversationId;
              if (failedConversationId === undefined) return;
              aui.threads.switchToThread(failedConversationId);
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
