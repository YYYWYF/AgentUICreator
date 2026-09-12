import {
  AgentConversationGroup,
  AgentConversationItem,
  AgentConversationList,
  AgentConversationState,
} from "../../agent-ui/components/conversation-list";
import { Button } from "../../agent-ui/primitives/button";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import {
  useAgentRun,
  useAgentRuntimeActions,
} from "../../runtime/context";
import {
  usePluginService,
  usePluginServiceSnapshot,
} from "../../runtime/plugins";
import {
  AGENT_UI_CONVERSATION_SERVICE,
  EMPTY_CONVERSATION_SNAPSHOT,
  type AgentUIConversationService,
  type ConversationSummary,
} from "../../services/conversations";

import "./styles.css";

interface ConversationGroup {
  label: string;
  items: ConversationSummary[];
}

function groupConversations(items: readonly ConversationSummary[]): ConversationGroup[] {
  const groups = new Map<string, ConversationSummary[]>();
  for (const item of items) {
    const label = item.group ?? "历史会话";
    const group = groups.get(label);
    if (group === undefined) {
      groups.set(label, [item]);
    } else {
      group.push(item);
    }
  }
  return [...groups].map(([label, groupItems]) => ({
    label,
    items: groupItems,
  }));
}

export function AgentConversationsPlugin(_props: UIPluginComponentProps) {
  const run = useAgentRun();
  const { startNewConversation } = useAgentRuntimeActions();
  const conversation = usePluginService<AgentUIConversationService>(
    AGENT_UI_CONVERSATION_SERVICE,
  );
  const snapshot = usePluginServiceSnapshot(
    conversation,
    EMPTY_CONVERSATION_SNAPSHOT,
  );
  const isRunning = run.status === "running";
  const groups = groupConversations(snapshot.conversations);

  return (
    <aside
      className="agent-conversations-plugin"
      data-agent-run-status={run.status}
      data-conversation-mode={snapshot.mode}
      data-ui-plugin="agent-conversations"
    >
      <AgentConversationList
        action={(
          <Button
            aria-label="新建会话"
            disabled={isRunning}
            onClick={() => {
              if (isRunning) return;
              void startNewConversation()
                .then(() => {
                  conversation?.resetForNewConversation();
                })
                .catch(() => undefined);
            }}
            size="sm"
            variant="ghost"
          >
            ＋ 新建
          </Button>
        )}
        ariaLabel="会话导航"
        meta={`${snapshot.conversations.length}`}
        title="会话"
      >
        <AgentConversationGroup label="当前">
          <AgentConversationItem
            active={snapshot.mode === "live"}
            onSelect={() => conversation?.showLiveConversation()}
            title="当前会话"
          />
        </AgentConversationGroup>

        {snapshot.listStatus === "loading" ? (
          <AgentConversationGroup label="历史会话">
            <AgentConversationState kind="loading">
              正在加载历史会话…
            </AgentConversationState>
          </AgentConversationGroup>
        ) : null}

        {snapshot.listStatus === "error" ? (
          <AgentConversationGroup label="历史会话">
            <AgentConversationState
              action={(
                <Button
                  onClick={() => {
                    void conversation?.refresh();
                  }}
                  size="sm"
                  variant="ghost"
                >
                  重试
                </Button>
              )}
              kind="error"
            >
              <strong>加载会话失败</strong>
              {snapshot.listError === undefined ? null : (
                <span>{snapshot.listError}</span>
              )}
            </AgentConversationState>
          </AgentConversationGroup>
        ) : null}

        {snapshot.listStatus === "ready" && groups.length === 0 ? (
          <AgentConversationGroup label="历史会话">
            <AgentConversationState kind="empty">
              暂无历史会话
            </AgentConversationState>
          </AgentConversationGroup>
        ) : null}

        {groups.map((group) => (
          <AgentConversationGroup key={group.label} label={group.label}>
            {group.items.map((item) => (
              <AgentConversationItem
                active={
                  snapshot.mode === "history" &&
                  snapshot.activeConversationId === item.id
                }
                key={item.id}
                onSelect={() => {
                  void conversation?.selectConversation(item.id);
                }}
                title={item.title}
                {...(item.disabled === undefined ? {} : { disabled: item.disabled })}
              />
            ))}
          </AgentConversationGroup>
        ))}
      </AgentConversationList>
    </aside>
  );
}
