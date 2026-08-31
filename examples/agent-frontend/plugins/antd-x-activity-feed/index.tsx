import { ThunderboltOutlined } from "@ant-design/icons";
import {
  CodeHighlighter,
  ThoughtChain,
  type ThoughtChainItemType,
} from "@ant-design/x";
import { Empty, Tag } from "antd";

import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { AGENT_UI_CONVERSATION_SERVICE } from "../../services/conversations";
import { inspectActivities } from "../_shared/agent-ui-data";

import "./styles.css";

export function AntdXActivityFeedPlugin({ context }: UIPluginComponentProps) {
  const conversation = context.services.get(AGENT_UI_CONVERSATION_SERVICE);
  const messages =
    conversation === undefined
      ? context.messages
      : context.messages.filter((message) =>
          conversation.includesMessage(message),
        );
  const activities = inspectActivities(messages, context.run);
  const items: ThoughtChainItemType[] = activities.map((activity) => ({
    key: activity.id,
    title: activity.title,
    description: activity.description,
    content: (
      <CodeHighlighter header={false} lang="json" prismLightMode={false}>
        {JSON.stringify(activity.content, null, 2)}
      </CodeHighlighter>
    ),
    icon: <ThunderboltOutlined />,
    status: activity.status,
    collapsible: true,
  }));

  return (
    <section
      aria-label="Agent 活动流"
      className="antd-x-activity-feed-plugin"
      data-agent-run-status={context.run.status}
      data-ui-plugin="antd-x-activity-feed"
    >
      <header className="antd-x-activity-feed-header">
        <span>
          <ThunderboltOutlined />
          <strong>活动流</strong>
        </span>
        <Tag variant="filled">{items.length} events</Tag>
      </header>
      <div className="antd-x-activity-feed-content">
        {items.length === 0 ? (
          <Empty
            description="当前会话暂无活动记录"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <ThoughtChain
            defaultExpandedKeys={items.map((item) => String(item.key))}
            items={items}
            line="dashed"
          />
        )}
      </div>
    </section>
  );
}
