import {
  HistoryOutlined,
  MessageOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import {
  Conversations,
  type ConversationItemType,
} from "@ant-design/x";
import { Alert, Badge, Button, Empty, Spin, Tooltip, Typography } from "antd";

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

import "./styles.css";

const LIVE_CONVERSATION_KEY = "__agent-ui-live-conversation__";

export function AntdXConversationsPlugin(_props: UIPluginComponentProps) {
  const run = useAgentRun();
  const conversation = usePluginService<AgentUIConversationService>(
    AGENT_UI_CONVERSATION_SERVICE,
  );
  const snapshot = usePluginServiceSnapshot(
    conversation,
    EMPTY_CONVERSATION_SNAPSHOT,
  );
  const isRunning = run.status === "running";
  const items: ConversationItemType[] = [
    {
      key: LIVE_CONVERSATION_KEY,
      label: "当前会话",
      group: "当前",
      icon: <MessageOutlined />,
    },
    ...snapshot.conversations.map((item) => ({
      key: item.id,
      label: item.title,
      icon: <HistoryOutlined />,
      group: item.group ?? "历史会话",
      ...(item.disabled === undefined ? {} : { disabled: item.disabled }),
    })),
  ];
  const groups = [
    ...new Set(
      items.flatMap((item) =>
        typeof item.group === "string" ? [item.group] : [],
      ),
    ),
  ];
  const activeKey = snapshot.mode === "live"
    ? LIVE_CONVERSATION_KEY
    : snapshot.activeConversationId;

  return (
    <aside
      aria-label="会话管理"
      className="antd-x-conversations-plugin"
      data-agent-run-status={run.status}
      data-conversation-mode={snapshot.mode}
      data-ui-plugin="antd-x-conversations"
    >
      <header className="antd-x-conversations-plugin-header">
        <span className="antd-x-conversations-plugin-title">
          <HistoryOutlined />
          <span>
            <Typography.Text type="secondary">Workspace</Typography.Text>
            <strong>会话管理</strong>
          </span>
        </span>
        <Badge count={snapshot.conversations.length} overflowCount={99} />
      </header>

      <div className="antd-x-conversations-plugin-create">
        <Tooltip
          title={
            isRunning ? "请等待当前运行结束后再新建会话" : "清空上下文并新建会话"
          }
        >
          <Button
            aria-label="新建会话"
            className="antd-x-conversations-plugin-create-button"
            disabled={isRunning}
            icon={<PlusOutlined />}
            loading={isRunning}
            onClick={() => {
              void conversation?.startNewConversation().catch(() => undefined);
            }}
          >
            新建会话
          </Button>
        </Tooltip>
      </div>

      <div className="antd-x-conversations-plugin-list">
        {snapshot.listStatus === "error" ? (
          <Alert
            action={
              <Button onClick={() => void conversation?.refresh()} size="small">
                重试
              </Button>
            }
            message={snapshot.listError ?? "历史会话加载失败"}
            showIcon
            type="error"
          />
        ) : null}
        <Spin spinning={snapshot.listStatus === "loading"} tip="历史会话加载中">
          {items.length === 1 && snapshot.listStatus === "ready" ? (
            <>
              <Conversations
                activeKey={LIVE_CONVERSATION_KEY}
                items={items}
                onActiveChange={() => conversation?.showLiveConversation()}
              />
              <Empty
                description="暂无历史会话"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            </>
          ) : (
            <Conversations
              {...(activeKey === undefined ? {} : { activeKey })}
              groupable={{ collapsible: true, defaultExpandedKeys: groups }}
              items={items}
              onActiveChange={(key: string) => {
                if (key === LIVE_CONVERSATION_KEY) {
                  conversation?.showLiveConversation();
                } else {
                  void conversation?.selectConversation(key);
                }
              }}
            />
          )}
        </Spin>
      </div>
    </aside>
  );
}
