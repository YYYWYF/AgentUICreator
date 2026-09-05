import { RobotOutlined, UserOutlined } from "@ant-design/icons";
import {
  Actions,
  Bubble,
  FileCard,
  Sources,
  type BubbleItemType,
  type BubbleListProps,
  type FileCardProps,
} from "@ant-design/x";
import { Avatar, Empty } from "antd";

import type {
  AgentMessage,
  UIPluginComponentProps,
} from "../../framework/contracts/ui-plugin";
import {
  AGENT_UI_CONVERSATION_SERVICE,
  getVisibleConversationMessages,
} from "../../services/conversations";

import "./styles.css";

const roleLabels: Record<string, string> = {
  user: "你",
  assistant: "智能体",
  system: "系统",
  tool: "工具",
};

function messageText(message: AgentMessage): string {
  if (!("content" in message)) {
    return "";
  }

  const content: unknown = message.content;

  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .flatMap((part) => {
      if (
        typeof part === "object" &&
        part !== null &&
        "type" in part &&
        part.type === "text" &&
        "text" in part &&
        typeof part.text === "string"
      ) {
        return part.text;
      }
      return [];
    })
    .join("\n");
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function messageFiles(message: AgentMessage): FileCardProps[] {
  if (message.role !== "user" || !Array.isArray(message.content)) {
    return [];
  }

  return message.content.flatMap((part, index) => {
    if (part.type === "text") {
      return [];
    }

    const partRecord = asRecord(part);
    const metadata = asRecord(partRecord?.metadata);
    const source = asRecord(partRecord?.source);
    const name =
      typeof metadata?.filename === "string"
        ? metadata.filename
        : typeof partRecord?.filename === "string"
          ? partRecord.filename
        : `${part.type}-${index + 1}`;
    const cardType =
      part.type === "image"
        ? "image"
        : part.type === "audio"
          ? "audio"
          : part.type === "video"
            ? "video"
            : "file";

    return [
      {
        key: `${message.id}-${index}`,
        name,
        type: cardType,
        ...(source?.type === "url" && typeof source.value === "string"
          ? { src: source.value }
          : typeof partRecord?.url === "string"
            ? { src: partRecord.url }
            : {}),
      },
    ];
  });
}

function messageSources(message: AgentMessage) {
  const agentUI = asRecord(message.metadata?.agentUI);
  const value = message.metadata?.sources ?? agentUI?.sources;

  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, index) => {
    const record = asRecord(item);
    const title = record?.title;
    if (
      record === undefined ||
      typeof title !== "string" ||
      title.trim().length === 0
    ) {
      return [];
    }
    return [
      {
        key: typeof record.key === "string" ? record.key : `source-${index}`,
        title,
        ...(typeof record.url === "string" ? { url: record.url } : {}),
        ...(typeof record.description === "string"
          ? { description: record.description }
          : {}),
      },
    ];
  });
}

function MessageActions({ text }: { text: string }) {
  return <Actions.Copy rootClassName="antd-x-message-list-actions" text={text} />;
}

function messageContent(message: AgentMessage) {
  const text = messageText(message);
  const files = messageFiles(message);
  const sources = messageSources(message);

  if (files.length === 0 && sources.length === 0) {
    if (text.length > 0) {
      return text;
    }
    if (message.role === "assistant" && (message.toolCalls?.length ?? 0) > 0) {
      return `已发起 ${message.toolCalls?.length ?? 0} 个工具调用，请在执行链中查看。`;
    }
    return "暂不支持此消息内容";
  }

  return (
    <div className="antd-x-message-list-rich-content">
      {text.length === 0 ? null : <p>{text}</p>}
      {files.length === 0 ? null : (
        <FileCard.List items={files} overflow="wrap" size="small" />
      )}
      {sources.length === 0 ? null : (
        <Sources inline items={sources} title={`${sources.length} 个来源`} />
      )}
    </div>
  );
}

function bubbleRole(role: string): string {
  if (role === "assistant") {
    return "ai";
  }
  if (role === "user") {
    return "user";
  }
  return "system";
}

function toBubbleItem(
  message: AgentMessage,
  renderAssistantActions: (messageId: string, text: string) => React.ReactNode,
): BubbleItemType {
  const text = messageText(message);
  return {
    key: message.id,
    role: bubbleRole(message.role),
    content: messageContent(message),
    header: (
      <span className="antd-x-message-list-role">
        {message.role === "assistant" ? (
          <span className="antd-x-message-list-role-dot" />
        ) : null}
        {roleLabels[message.role] ?? message.role}
      </span>
    ),
    ...(message.role === "assistant"
      ? {
          footer: renderAssistantActions(message.id, text),
          footerPlacement: "outer-start" as const,
        }
      : {}),
  };
}

const bubbleRoles: NonNullable<BubbleListProps["role"]> = {
  ai: {
    avatar: (
      <Avatar className="antd-x-message-list-avatar--agent" icon={<RobotOutlined />} />
    ),
    placement: "start",
    rootClassName: "antd-x-message-list-bubble--agent",
    shape: "corner",
    variant: "filled",
  },
  user: {
    avatar: (
      <Avatar
        className="antd-x-message-list-avatar--user"
        icon={<UserOutlined />}
      />
    ),
    placement: "end",
    rootClassName: "antd-x-message-list-bubble--user",
    shape: "corner",
    variant: "filled",
  },
  system: {
    placement: "start",
    rootClassName: "antd-x-message-list-bubble--system",
    variant: "borderless",
  },
};

export function AntdXMessageListPlugin({
  context,
}: UIPluginComponentProps) {
  const conversation = context.services.get(
    AGENT_UI_CONVERSATION_SERVICE,
  );
  const items = getVisibleConversationMessages(context.messages, conversation)
    .map((message) =>
      toBubbleItem(message, (_messageId, text) => <MessageActions text={text} />),
    );
  const emptyText =
    typeof context.instance.props?.emptyText === "string"
      ? context.instance.props.emptyText
      : "开始一段新对话";

  if (context.run.status === "running") {
    items.push({
      key: `${context.instance.id}-running`,
      role: "ai",
      content: "智能体正在处理…",
      header: "智能体",
      loading: true,
      status: "loading",
    });
  }

  return (
    <section
      aria-label="智能体消息"
      className="antd-x-message-list-plugin"
      data-agent-run-status={context.run.status}
      data-ui-plugin="antd-x-message-list"
    >
      {items.length === 0 ? (
        <Empty description={emptyText} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Bubble.List autoScroll items={items} role={bubbleRoles} />
      )}
    </section>
  );
}
