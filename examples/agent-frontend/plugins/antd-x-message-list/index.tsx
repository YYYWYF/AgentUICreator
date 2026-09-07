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
import {
  projectAgentTurns,
  type AgentTurn,
} from "@agent-ui/runtime-core";

import type {
  AgentMessage,
  UIPluginComponentProps,
} from "../../framework/contracts/ui-plugin";
import {
  useAgentMessages,
  useAgentRun,
  usePluginInstance,
} from "../../runtime/context";
import { usePluginService } from "../../runtime/plugins";
import {
  AGENT_UI_CONVERSATION_SERVICE,
  getConversationMessages,
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

function toLeadingBubbleItem(
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

type AgentAssistantMessage = Extract<AgentMessage, { role: "assistant" }>;

function isAssistantMessage(
  message: AgentMessage,
): message is AgentAssistantMessage {
  return message.role === "assistant";
}

function hasRenderableAssistantContent(
  message: AgentAssistantMessage,
): boolean {
  return messageText(message).length > 0 || messageSources(message).length > 0;
}

function assistantTurnText(turn: AgentTurn): string {
  return turn.responseMessages
    .filter(isAssistantMessage)
    .map(messageText)
    .filter((text) => text.length > 0)
    .join("\n\n");
}

function AssistantTurnLoading() {
  return (
    <span
      aria-label="智能体正在处理"
      className="antd-x-message-list-turn-loading"
    >
      <span aria-hidden="true" className="ant-bubble-dot">
        <i className="ant-bubble-dot-item" />
        <i className="ant-bubble-dot-item" />
        <i className="ant-bubble-dot-item" />
      </span>
    </span>
  );
}

function AssistantTurnContent({
  turn,
  running,
}: {
  turn: AgentTurn;
  running: boolean;
}) {
  const messages = turn.responseMessages
    .filter(isAssistantMessage)
    .filter(hasRenderableAssistantContent);

  return (
    <div className="antd-x-message-list-turn-content">
      {messages.map((message) => (
        <div
          className="antd-x-message-list-turn-segment"
          key={message.id}
        >
          {messageContent(message)}
        </div>
      ))}
      {running ? <AssistantTurnLoading /> : null}
    </div>
  );
}

function toTurnBubbleItems({
  turn,
  running,
}: {
  turn: AgentTurn;
  running: boolean;
}): BubbleItemType[] {
  const userBubble: BubbleItemType = {
    key: turn.userMessage.id,
    role: "user",
    content: messageContent(turn.userMessage),
    header: (
      <span className="antd-x-message-list-role">
        {roleLabels.user}
      </span>
    ),
    "data-agent-turn-id": turn.id,
    "data-agent-turn-role": "user",
  };
  const assistantMessages = turn.responseMessages
    .filter(isAssistantMessage)
    .filter(hasRenderableAssistantContent);

  if (assistantMessages.length === 0 && !running) {
    return [userBubble];
  }

  const text = assistantTurnText(turn);
  const assistantBubble: BubbleItemType = {
    key: `assistant-turn:${turn.id}`,
    role: "ai",
    content: <AssistantTurnContent running={running} turn={turn} />,
    header: (
      <span className="antd-x-message-list-role">
        <span className="antd-x-message-list-role-dot" />
        {roleLabels.assistant}
      </span>
    ),
    ...(text.length > 0
      ? {
          footer: <MessageActions text={text} />,
          footerPlacement: "outer-start" as const,
        }
      : {}),
    ...(running ? { status: "loading" as const } : {}),
    "data-agent-turn-id": turn.id,
    "data-agent-turn-role": "assistant",
  };

  return [userBubble, assistantBubble];
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

export function AntdXMessageListPlugin(_props: UIPluginComponentProps) {
  const messages = useAgentMessages();
  const run = useAgentRun();
  const instance = usePluginInstance();
  const conversation = usePluginService(
    AGENT_UI_CONVERSATION_SERVICE,
  );
  const conversationMessages = getConversationMessages(messages, conversation);
  const { leadingMessages, turns } = projectAgentTurns(conversationMessages);
  const items = leadingMessages
    .filter(
      (message) =>
        message.role !== "tool" &&
        message.role !== "reasoning" &&
        message.role !== "activity" &&
        !(
          message.role === "assistant" &&
          !hasRenderableAssistantContent(message)
        ),
    )
    .map((message) =>
      toLeadingBubbleItem(message, (_messageId, text) => (
        <MessageActions text={text} />
      )),
    );

  turns.forEach((turn, index) => {
    items.push(
      ...toTurnBubbleItems({
        turn,
        running: run.status === "running" && index === turns.length - 1,
      }),
    );
  });
  const emptyText =
    typeof instance.props?.emptyText === "string"
      ? instance.props.emptyText
      : "开始一段新对话";

  return (
    <section
      aria-label="智能体消息"
      className="antd-x-message-list-plugin"
      data-agent-run-status={run.status}
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
