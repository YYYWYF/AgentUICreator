import { LinkOutlined } from "@ant-design/icons";
import { Sources } from "@ant-design/x";
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
import { inspectSources } from "../_shared/agent-ui-data";

import "./styles.css";

export function AntdXSourcesPlugin(_props: UIPluginComponentProps) {
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
  const sources = inspectSources(messages, state);

  return (
    <section
      aria-label="Agent 来源"
      className="antd-x-sources-plugin"
      data-ui-plugin="antd-x-sources"
    >
      <header className="antd-x-sources-header">
        <span>
          <LinkOutlined />
          <strong>来源</strong>
        </span>
        <Tag variant="filled">{sources.length} refs</Tag>
      </header>
      <div className="antd-x-sources-content">
        {sources.length === 0 ? (
          <Empty
            description="当前会话暂无来源"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <Sources
            defaultExpanded
            items={sources.map((source) => ({
              key: source.key,
              title: source.title,
              ...(source.url === undefined ? {} : { url: source.url }),
              ...(source.description === undefined
                ? {}
                : { description: source.description }),
            }))}
            title={`${sources.length} 个来源`}
          />
        )}
      </div>
    </section>
  );
}
