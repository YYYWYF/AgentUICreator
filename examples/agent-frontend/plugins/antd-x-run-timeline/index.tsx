import {
  ApiOutlined,
  CheckCircleOutlined,
  CodeOutlined,
  LoadingOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  CodeHighlighter,
  Mermaid,
  Think,
  ThoughtChain,
  type ThoughtChainItemType,
} from "@ant-design/x";
import { Empty, Tag, Typography } from "antd";
import type { ReactNode } from "react";

import type {
  AgentMessage,
  UIPluginComponentProps,
  UIPluginRunState,
} from "../../framework/contracts/ui-plugin";
import { AGENT_UI_CONVERSATION_SERVICE } from "../../services/conversations";

import "./styles.css";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function readableJSON(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function statusForTool(
  result: Extract<AgentMessage, { role: "tool" }> | undefined,
  run: UIPluginRunState,
): "loading" | "success" | "error" | "abort" {
  if (result?.error !== undefined) {
    return "error";
  }
  if (result !== undefined) {
    return "success";
  }
  return run.status === "running"
    ? "loading"
    : run.status === "error"
      ? "error"
      : "abort";
}

function ToolPayload({
  argumentsText,
  result,
}: {
  argumentsText: string;
  result: Extract<AgentMessage, { role: "tool" }> | undefined;
}) {
  const agentUI = asRecord(result?.metadata?.agentUI);
  const renderType = agentUI?.render;

  return (
    <div className="antd-x-run-timeline-payload">
      <CodeHighlighter header="Arguments" lang="json" prismLightMode={false}>
        {readableJSON(argumentsText)}
      </CodeHighlighter>
      {result === undefined ? (
        <Typography.Text type="secondary">等待工具返回结果…</Typography.Text>
      ) : renderType === "mermaid" ? (
        <Mermaid
          actions={{ enableCopy: true, enableDownload: false, enableZoom: true }}
          header="Tool result"
        >
          {result.content}
        </Mermaid>
      ) : (
        <CodeHighlighter header="Result" lang="json" prismLightMode={false}>
          {readableJSON(result.content)}
        </CodeHighlighter>
      )}
    </div>
  );
}

function activityDescription(message: Extract<AgentMessage, { role: "activity" }>) {
  const title = message.content.title;
  const description = message.content.description;

  return {
    title:
      typeof title === "string" && title.trim().length > 0
        ? title
        : message.activityType,
    description:
      typeof description === "string" ? description : "AG-UI activity",
  };
}

function timelineItems(
  messages: AgentMessage[],
  run: UIPluginRunState,
): ThoughtChainItemType[] {
  const results = new Map(
    messages
      .filter(
        (message): message is Extract<AgentMessage, { role: "tool" }> =>
          message.role === "tool",
      )
      .map((message) => [message.toolCallId, message]),
  );
  const items: ThoughtChainItemType[] = [];

  messages.forEach((message) => {
    if (message.role === "assistant") {
      message.toolCalls?.forEach((toolCall) => {
        const result = results.get(toolCall.id);
        const status = statusForTool(result, run);
        items.push({
          key: toolCall.id,
          title: toolCall.function.name,
          description:
            status === "loading"
              ? "工具执行中"
              : status === "success"
                ? "工具已完成"
                : status === "error"
                  ? result?.error ?? "工具执行失败"
                  : "工具未返回结果",
          content: (
            <ToolPayload
              argumentsText={toolCall.function.arguments}
              result={result}
            />
          ),
          icon:
            status === "loading" ? (
              <LoadingOutlined spin />
            ) : status === "success" ? (
              <CheckCircleOutlined />
            ) : (
              <ApiOutlined />
            ),
          status,
          collapsible: true,
        });
      });
    }

    if (message.role === "activity") {
      const activity = activityDescription(message);
      items.push({
        key: message.id,
        title: activity.title,
        description: activity.description,
        content: (
          <CodeHighlighter header={false} lang="json" prismLightMode={false}>
            {JSON.stringify(message.content, null, 2)}
          </CodeHighlighter>
        ),
        icon: <ThunderboltOutlined />,
        status: "success",
        collapsible: true,
      });
    }
  });

  return items;
}

function reasoningContent(messages: AgentMessage[]): ReactNode {
  const reasoning = messages
    .filter(
      (message): message is Extract<AgentMessage, { role: "reasoning" }> =>
        message.role === "reasoning",
    )
    .map((message) => message.content.trim())
    .filter(Boolean);

  return reasoning.length === 0 ? undefined : reasoning.join("\n\n");
}

export function AntdXRunTimelinePlugin({
  context,
}: UIPluginComponentProps) {
  const conversation = context.services.get(
    AGENT_UI_CONVERSATION_SERVICE,
  );
  const messages =
    conversation === undefined
      ? context.messages
      : context.messages.filter((message) =>
          conversation.includesMessage(message),
        );
  const reasoning = reasoningContent(messages);
  const items = timelineItems(messages, context.run);
  const hasContent = reasoning !== undefined || items.length > 0;

  return (
    <section
      aria-label="Agent 执行链"
      className="antd-x-run-timeline-plugin"
      data-agent-run-status={context.run.status}
      data-ui-plugin="antd-x-run-timeline"
    >
      <header className="antd-x-run-timeline-header">
        <span>
          <CodeOutlined />
          <strong>执行链</strong>
        </span>
        <Tag variant="filled">{items.length} events</Tag>
      </header>

      <div className="antd-x-run-timeline-content">
        {!hasContent ? (
          <Empty description="当前会话暂无执行记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <>
            {reasoning === undefined ? null : (
              <Think
                defaultExpanded
                loading={context.run.status === "running"}
                title={context.run.status === "running" ? "正在思考" : "思考过程"}
              >
                <Typography.Paragraph>{reasoning}</Typography.Paragraph>
              </Think>
            )}
            {items.length === 0 ? null : (
              <ThoughtChain
                defaultExpandedKeys={items.map((item) => String(item.key))}
                items={items}
                line="dashed"
              />
            )}
          </>
        )}
      </div>
    </section>
  );
}
