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
import { Alert, Avatar, Empty, Spin } from "antd";
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
import {
  usePluginService,
  usePluginServiceSnapshot,
} from "../../runtime/plugins";
import {
  AGENT_UI_CONVERSATION_SERVICE,
  EMPTY_CONVERSATION_SNAPSHOT,
  getConversationViewMessages,
  isChatVisibleMessage,
  type AgentUIConversationService,
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

function SegmentLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="antd-x-message-list-segment-label">
      {children}
    </div>
  );
}

function AssistantMessageSegment({
  message,
}: {
  message: AgentAssistantMessage;
}) {
  const text = messageText(message);
  const sources = messageSources(message);
  const hasContent = text.length > 0 || sources.length > 0;

  return (
    <>
      {hasContent ? messageContent(message) : null}
      {(message.toolCalls?.length ?? 0) === 0 ? null : (
        <div className="antd-x-message-list-tool-call-segment">
          <SegmentLabel>工具调用</SegmentLabel>
          {message.toolCalls?.map((call) => (
            <div className="antd-x-message-list-tool-call" key={call.id}>
              <span aria-hidden="true">🔧</span>
              <strong>{call.function.name}</strong>
            </div>
          ))}
        </div>
      )}
      {!hasContent && (message.toolCalls?.length ?? 0) === 0
        ? messageContent(message)
        : null}
    </>
  );
}

function ToolMessageSegment({
  message,
}: {
  message: Extract<AgentMessage, { role: "tool" }>;
}) {
  return (
    <div
      className={`antd-x-message-list-tool-result${
        message.error === undefined
          ? ""
          : " antd-x-message-list-tool-result--error"
      }`}
    >
      <SegmentLabel>
        {message.error === undefined ? "工具结果" : "工具执行失败"}
      </SegmentLabel>
      <div>{message.error ?? message.content}</div>
    </div>
  );
}

function ReasoningMessageSegment({
  message,
}: {
  message: Extract<AgentMessage, { role: "reasoning" }>;
}) {
  return (
    <div className="antd-x-message-list-reasoning-segment">
      <SegmentLabel>思考</SegmentLabel>
      <div>{message.content}</div>
    </div>
  );
}

function ActivityMessageSegment({
  message,
}: {
  message: Extract<AgentMessage, { role: "activity" }>;
}) {
  const title =
    typeof message.content.title === "string"
      ? message.content.title
      : message.activityType;
  const description =
    typeof message.content.description === "string"
      ? message.content.description
      : undefined;

  return (
    <div className="antd-x-message-list-activity-segment">
      <SegmentLabel>Activity</SegmentLabel>
      <strong>{title}</strong>
      {description === undefined ? null : <div>{description}</div>}
    </div>
  );
}

function ContextMessageSegment({
  label,
  message,
}: {
  label: string;
  message: Extract<AgentMessage, { role: "system" | "developer" }>;
}) {
  return (
    <div className="antd-x-message-list-context-segment">
      <SegmentLabel>{label}</SegmentLabel>
      <div>{message.content}</div>
    </div>
  );
}

function TurnMessageSegment({ message }: { message: AgentMessage }) {
  let content: React.ReactNode;

  switch (message.role) {
    case "assistant":
      content = <AssistantMessageSegment message={message} />;
      break;
    case "tool":
      content = <ToolMessageSegment message={message} />;
      break;
    case "reasoning":
      content = <ReasoningMessageSegment message={message} />;
      break;
    case "activity":
      content = <ActivityMessageSegment message={message} />;
      break;
    case "system":
      content = <ContextMessageSegment label="系统" message={message} />;
      break;
    case "developer":
      content = <ContextMessageSegment label="开发者" message={message} />;
      break;
    case "user":
      content = messageContent(message);
      break;
  }

  return (
    <div
      className={`antd-x-message-list-turn-segment antd-x-message-list-segment--${message.role}`}
      data-agent-message-id={message.id}
    >
      {content}
    </div>
  );
}

function AssistantTurnContent({
  turn,
  running,
}: {
  turn: AgentTurn;
  running: boolean;
}) {
  return (
    <div className="antd-x-message-list-turn-content">
      {turn.responseMessages.map((message) => (
        <TurnMessageSegment key={message.id} message={message} />
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
  if (turn.responseMessages.length === 0 && !running) {
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
  const conversation = usePluginService<AgentUIConversationService>(
    AGENT_UI_CONVERSATION_SERVICE,
  );
  const conversationSnapshot = usePluginServiceSnapshot(
    conversation,
    EMPTY_CONVERSATION_SNAPSHOT,
  );
  const conversationMessages = getConversationViewMessages(
    messages,
    conversationSnapshot,
  );
  const { leadingMessages, turns } = projectAgentTurns(conversationMessages);
  const items = leadingMessages
    .filter(isChatVisibleMessage)
    .filter(
      (message) =>
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
        running:
          conversationSnapshot.mode === "live" &&
          run.status === "running" &&
          index === turns.length - 1,
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
      data-conversation-mode={conversationSnapshot.mode}
      data-ui-plugin="antd-x-message-list"
    >
      {conversationSnapshot.mode === "history" &&
      conversationSnapshot.detailStatus === "loading" ? (
        <Spin tip="历史会话加载中">
          <div aria-label="历史会话加载中" className="antd-x-message-list-history-status" />
        </Spin>
      ) : conversationSnapshot.mode === "history" &&
        conversationSnapshot.detailStatus === "error" ? (
        <Alert
          message={conversationSnapshot.detailError ?? "历史会话加载失败"}
          showIcon
          type="error"
        />
      ) : items.length === 0 ? (
        <Empty description={emptyText} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Bubble.List autoScroll items={items} role={bubbleRoles} />
      )}
    </section>
  );
}
