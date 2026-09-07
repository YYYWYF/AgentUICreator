import { BulbOutlined } from "@ant-design/icons";
import { Think } from "@ant-design/x";
import { Empty, Tag, Typography } from "antd";

import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import {
  useAgentExecutions,
  useAgentMessages,
  useAgentRun,
  usePluginInstance,
} from "../../runtime/context";
import { usePluginService, usePluginServiceSnapshot } from "../../runtime/plugins";
import {
  AGENT_UI_CONVERSATION_SERVICE,
  EMPTY_CONVERSATION_SNAPSHOT,
  getConversationViewMessages,
  type AgentUIConversationService,
} from "../../services/conversations";

import "./styles.css";

export function AntdXReasoningPlugin(_props: UIPluginComponentProps) {
  const allMessages = useAgentMessages();
  const executions = useAgentExecutions();
  const run = useAgentRun();
  const instance = usePluginInstance();
  const conversation = usePluginService<AgentUIConversationService>(
    AGENT_UI_CONVERSATION_SERVICE,
  );
  const snapshot = usePluginServiceSnapshot(
    conversation,
    EMPTY_CONVERSATION_SNAPSHOT,
  );
  const messages = getConversationViewMessages(allMessages, snapshot);
  const reasoningExecutions = executions.filter(
    (execution) => execution.type === "reasoning",
  );
  const reasoning = messages.flatMap((message) =>
    message.role === "reasoning" && message.content.trim().length > 0
      ? [{
          id: message.id,
          content: message.content.trim(),
          status: reasoningExecutions.find((execution) =>
            execution.messageIds.includes(message.id),
          )?.status,
        }]
      : [],
  );
  const defaultExpanded = instance.props?.defaultExpanded !== false;

  return (
    <section
      aria-label="思考过程"
      className="antd-x-reasoning-plugin"
      data-agent-run-status={run.status}
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
          reasoning.map((entry, index) => (
            <Think
              defaultExpanded={defaultExpanded}
              key={entry.id}
              loading={entry.status === "running"}
              title={
                entry.status === "running"
                  ? "正在思考"
                  : `思考 ${index + 1}`
              }
            >
              <Typography.Paragraph>{entry.content}</Typography.Paragraph>
            </Think>
          ))
        )}
      </div>
    </section>
  );
}
