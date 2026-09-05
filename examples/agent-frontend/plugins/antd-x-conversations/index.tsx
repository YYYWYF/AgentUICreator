import { HistoryOutlined, MessageOutlined, PlusOutlined } from "@ant-design/icons";
import {
  Conversations,
  type ConversationItemType,
} from "@ant-design/x";
import { Badge, Button, Empty, Tooltip, Typography } from "antd";

import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { AGENT_UI_CONVERSATION_SERVICE } from "../../services/conversations";
import { readConversationKey } from "./conversation-service";

import "./styles.css";

interface ConversationRecord {
  key: string;
  label: string;
  group: string | undefined;
  disabled: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function readConversationRecords(value: unknown): ConversationRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = asRecord(item);
    const key = readConversationKey(record?.key ?? record?.id);
    const label = readConversationKey(record?.label ?? record?.title);

    if (key === undefined || label === undefined) {
      return [];
    }

    return [
      {
        key,
        label,
        group: readConversationKey(record?.group),
        disabled: record?.disabled === true,
      },
    ];
  });
}

function conversationsFromContext(
  state: unknown,
  props: Record<string, unknown> | undefined,
): ConversationRecord[] {
  const stateRecord = asRecord(state);
  const agentUI = asRecord(stateRecord?.agentUI);
  const stateItems =
    readConversationRecords(agentUI?.conversations).length > 0
      ? readConversationRecords(agentUI?.conversations)
      : readConversationRecords(stateRecord?.conversations);

  return stateItems.length > 0
    ? stateItems
    : readConversationRecords(props?.items);
}

export function AntdXConversationsPlugin({
  context,
}: UIPluginComponentProps) {
  const isRunning = context.run.status === "running";
  const conversations = conversationsFromContext(
    context.state,
    context.instance.props,
  );
  const service = context.services.get(AGENT_UI_CONVERSATION_SERVICE);
  const activeKey =
    service?.activeKey ?? readConversationKey(context.instance.props?.activeKey);
  const items: ConversationItemType[] = conversations.map((conversation) => ({
    key: conversation.key,
    label: conversation.label,
    disabled: conversation.disabled,
    icon: <MessageOutlined />,
    ...(conversation.group === undefined ? {} : { group: conversation.group }),
  }));
  const groups = [
    ...new Set(
      conversations.flatMap((conversation) =>
        conversation.group === undefined ? [] : [conversation.group],
      ),
    ),
  ];

  return (
    <aside
      aria-label="会话管理"
      className="antd-x-conversations-plugin"
      data-agent-run-status={context.run.status}
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
        <Badge count={items.length} overflowCount={99} />
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
              void context.actions.startNewConversation()
                .then(() => context.actions.updateInstanceProps({ activeKey: null }))
                .catch(() => undefined);
            }}
          >
            新建会话
          </Button>
        </Tooltip>
      </div>

      {items.length === 0 ? (
        <Empty description="暂无历史会话" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Conversations
          {...(activeKey === undefined ? {} : { activeKey })}
          groupable={{ collapsible: true, defaultExpandedKeys: groups }}
          items={items}
          onActiveChange={(key: string) => {
            context.actions.updateInstanceProps({ activeKey: key });
          }}
        />
      )}

    </aside>
  );
}
