import { BulbOutlined } from "@ant-design/icons";
import { Think } from "@ant-design/x";
import { Empty, Tag, Typography } from "antd";

import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { AGENT_UI_CONVERSATION_SERVICE } from "../../services/conversations";
import { inspectReasoning } from "../_shared/agent-ui-data";

import "./styles.css";

export function AntdXReasoningPlugin({ context }: UIPluginComponentProps) {
  const conversation = context.services.get(AGENT_UI_CONVERSATION_SERVICE);
  const messages =
    conversation === undefined
      ? context.messages
      : context.messages.filter((message) =>
          conversation.includesMessage(message),
        );
  const reasoning = inspectReasoning(messages);
  const defaultExpanded = context.instance.props?.defaultExpanded !== false;

  return (
    <section
      aria-label="思考过程"
      className="antd-x-reasoning-plugin"
      data-agent-run-status={context.run.status}
      data-ui-plugin="antd-x-reasoning"
    >
      <header className="antd-x-reasoning-header">
        <span>
          <BulbOutlined />
          <strong>思考过程</strong>
        </span>
        <Tag variant="filled">{reasoning.length} entries</Tag>
      </header>
      <div className="antd-x-reasoning-content">
        {reasoning.length === 0 ? (
          <Empty
            description="当前会话暂无可展示的思考过程"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          reasoning.map((content, index) => (
            <Think
              defaultExpanded={defaultExpanded}
              key={`reasoning-${index}`}
              loading={
                context.run.status === "running" &&
                index === reasoning.length - 1
              }
              title={
                context.run.status === "running" &&
                index === reasoning.length - 1
                  ? "正在思考"
                  : `思考 ${index + 1}`
              }
            >
              <Typography.Paragraph>{content}</Typography.Paragraph>
            </Think>
          ))
        )}
      </div>
    </section>
  );
}
