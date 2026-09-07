import { PaperClipOutlined } from "@ant-design/icons";
import { Attachments, type AttachmentsProps } from "@ant-design/x";
import { Empty, Tag } from "antd";

import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { useAgentMessages, useAgentState } from "../../runtime/context";
import { usePluginService, usePluginServiceSnapshot } from "../../runtime/plugins";
import {
  AGENT_UI_CONVERSATION_SERVICE,
  EMPTY_CONVERSATION_SNAPSHOT,
  getConversationViewMessages,
  type AgentUIConversationService,
} from "../../services/conversations";
import { inspectAttachments } from "../_shared/agent-ui-data";

import "./styles.css";

export function AntdXAttachmentsPlugin(_props: UIPluginComponentProps) {
  const allMessages = useAgentMessages();
  const state = useAgentState();
  const conversation = usePluginService<AgentUIConversationService>(
    AGENT_UI_CONVERSATION_SERVICE,
  );
  const snapshot = usePluginServiceSnapshot(
    conversation,
    EMPTY_CONVERSATION_SNAPSHOT,
  );
  const messages = getConversationViewMessages(allMessages, snapshot);
  const attachments = inspectAttachments(messages, state);
  const items: NonNullable<AttachmentsProps["items"]> = attachments.map(
    (attachment) => ({
      "aria-label": attachment.name,
      "aria-labelledby": undefined,
      uid: attachment.key,
      name: attachment.name,
      status: "done",
      cardType: attachment.cardType,
      ...(attachment.url === undefined ? {} : { url: attachment.url }),
      ...(attachment.byte === undefined ? {} : { size: attachment.byte }),
      ...(attachment.description === undefined
        ? {}
        : { description: attachment.description }),
    }),
  );

  return (
    <section
      aria-label="Agent 附件"
      className="antd-x-attachments-plugin"
      data-readonly="true"
      data-ui-plugin="antd-x-attachments"
    >
      <header className="antd-x-attachments-header">
        <span>
          <PaperClipOutlined />
          <strong>附件</strong>
        </span>
        <Tag variant="filled">只读 · {items.length}</Tag>
      </header>
      <div className="antd-x-attachments-content">
        {items.length === 0 ? (
          <Empty
            description="当前会话暂无附件"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <Attachments disabled items={items} overflow="wrap" />
        )}
      </div>
    </section>
  );
}
