import {
  Actions,
  Bubble,
  FileCard,
  Sources,
  type BubbleItemType,
  type BubbleListProps,
  type FileCardProps,
} from "@ant-design/x";
import { Alert, Empty, Spin } from "antd";
import {
  projectAgentTurns,
  type AgentTurn,
} from "@agent-ui/runtime-core";

import {
  AgentMessage,
  type AgentMessageRole,
} from "../../agent-ui/components/message";
import type {
  AgentExecution,
  AgentMessage as RuntimeAgentMessage,
  UIPluginComponentProps,
} from "../../framework/contracts/ui-plugin";
import {
  useAgentExecutions,
  useAgentMessages,
  useAgentRun,
  usePluginInstance,
} from "../../runtime/context";
import {
  MessageRenderProvider,
  type ToolActivityStatus,
  type ToolPresentation,
  type ToolPresentationItem,
} from "../../runtime/message-rendering";
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
import {
  inspectToolCalls,
  type ToolCallInspection,
} from "../_shared/agent-ui-data";
import {
  projectTurnToolActivities,
  type AssistantTurnPresentationSegment,
} from "./tool-presentation";

import "./styles.css";

const roleLabels: Record<string, string> = {
  user: "你",
  assistant: "智能体",
  system: "系统",
  tool: "工具",
};

function messageText(message: RuntimeAgentMessage): string {
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

function messageFiles(message: RuntimeAgentMessage): FileCardProps[] {
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

function messageSources(message: RuntimeAgentMessage) {
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

function messageContent(message: RuntimeAgentMessage) {
  const text = messageText(message);
  const files = messageFiles(message);
  const sources = messageSources(message);

  if (text.length === 0 && files.length === 0 && sources.length === 0) {
    return (
      <p className="antd-x-message-list-text">
        暂不支持此消息内容
      </p>
    );
  }

  return (
    <div className="antd-x-message-list-rich-content">
      {text.length === 0 ? null : (
        <p className="antd-x-message-list-text">{text}</p>
      )}
      {files.length === 0 ? null : (
        <FileCard.List items={files} overflow="wrap" size="small" />
      )}
      {sources.length === 0 ? null : (
        <Sources inline items={sources} title={`${sources.length} 个来源`} />
      )}
    </div>
  );
}

function presentationRole(
  role: RuntimeAgentMessage["role"],
): AgentMessageRole {
  if (role === "user") {
    return "user";
  }

  if (role === "assistant") {
    return "assistant";
  }

  return "system";
}

function MessageRoleLabel({ role }: { role: string }) {
  return (
    <span className="antd-x-message-list-role">
      {roleLabels[role] ?? role}
    </span>
  );
}

function bubbleRole(role: RuntimeAgentMessage["role"]): string {
  if (role === "assistant") {
    return "ai";
  }
  if (role === "user") {
    return "user";
  }
  return "system";
}

function toLeadingBubbleItem(message: RuntimeAgentMessage): BubbleItemType {
  const text = messageText(message);
  return {
    key: message.id,
    role: bubbleRole(message.role),
    content: (
      <AgentMessage
        role={presentationRole(message.role)}
        header={<MessageRoleLabel role={message.role} />}
        actions={
          message.role === "assistant" && text.length > 0
            ? <MessageActions text={text} />
            : undefined
        }
      >
        {messageContent(message)}
      </AgentMessage>
    ),
  };
}

type AgentAssistantMessage = Extract<
  RuntimeAgentMessage,
  { role: "assistant" }
>;

function isAssistantMessage(
  message: RuntimeAgentMessage,
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
    <span className="antd-x-message-list-turn-loading">
      智能体正在处理…
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

function LegacyToolActivityRenderer({
  items,
}: {
  items: readonly ToolPresentationItem[];
}) {
  return (
    <div className="antd-x-message-list-tool-result">
      <SegmentLabel>工具活动</SegmentLabel>
      {items.map((item) => (
        <div className="antd-x-message-list-tool-call" key={item.toolCall.id}>
          <span aria-hidden="true">🔧</span>
          <strong>{item.toolCall.function.name}</strong>
          <span>
            {item.status === "loading"
              ? "正在执行…"
              : item.status === "success"
                ? "已完成"
                : item.status === "error"
                  ? "失败"
                  : "未完成"}
          </span>
          <span>
            {item.result?.error ?? item.result?.content ?? "工具没有返回结果"}
          </span>
        </div>
      ))}
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
      {!hasContent && (message.toolCalls?.length ?? 0) === 0
        ? messageContent(message)
        : null}
    </>
  );
}

function GenericToolResultSegment({
  message,
}: {
  message: Extract<RuntimeAgentMessage, { role: "tool" }>;
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

function LegacyReasoningMessageRenderer({
  message,
}: {
  message: Extract<RuntimeAgentMessage, { role: "reasoning" }>;
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
  message: Extract<RuntimeAgentMessage, { role: "activity" }>;
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
  message: Extract<RuntimeAgentMessage, { role: "system" | "developer" }>;
}) {
  return (
    <div className="antd-x-message-list-context-segment">
      <SegmentLabel>{label}</SegmentLabel>
      <div>{message.content}</div>
    </div>
  );
}

function TurnMessageSegment({
  message,
  reasoningExecutionByMessageId,
  renderSlot,
  turnId,
}: {
  message: RuntimeAgentMessage;
  reasoningExecutionByMessageId: ReadonlyMap<
    string,
    Extract<AgentExecution, { type: "reasoning" }>
  >;
  renderSlot: UIPluginComponentProps["renderSlot"];
  turnId: string;
}) {
  let content: React.ReactNode;

  switch (message.role) {
    case "assistant":
      content = <AssistantMessageSegment message={message} />;
      break;
    case "tool":
      content = <GenericToolResultSegment message={message} />;
      break;
    case "reasoning": {
      const execution = reasoningExecutionByMessageId.get(message.id);
      const running = execution?.status === "running";
      content = (
        <MessageRenderProvider
          value={{
            kind: "reasoning",
            turnId,
            message,
            execution,
            running,
          }}
        >
          {renderSlot(
            "conversation.message.reasoning",
            <LegacyReasoningMessageRenderer message={message} />,
          )}
        </MessageRenderProvider>
      );
      break;
    }
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

function deriveToolActivityStatus(
  items: readonly ToolPresentationItem[],
): {
  status: ToolActivityStatus;
  activeToolCallIds: readonly string[];
} {
  const activeToolCallIds = items.flatMap((item) =>
    item.status === "loading" ? [item.toolCall.id] : [],
  );
  if (activeToolCallIds.length > 0) {
    return { status: "running", activeToolCallIds };
  }
  if (items.some((item) => item.status === "error")) {
    return { status: "error", activeToolCallIds };
  }
  if (items.some((item) => item.status === "abort")) {
    return { status: "interrupted", activeToolCallIds };
  }
  return { status: "completed", activeToolCallIds };
}

function ToolActivitySegment({
  items,
  presentation,
  renderSlot,
  turnId,
}: {
  items: readonly ToolPresentationItem[];
  presentation: ToolPresentation;
  renderSlot: UIPluginComponentProps["renderSlot"];
  turnId: string;
}) {
  const { activeToolCallIds, status } = deriveToolActivityStatus(items);
  return (
    <MessageRenderProvider
      value={{
        kind: "tool-activity",
        turnId,
        presentation,
        items,
        status,
        activeToolCallIds,
      }}
    >
      {renderSlot(
        "conversation.message.tool-activity",
        <LegacyToolActivityRenderer items={items} />,
      )}
    </MessageRenderProvider>
  );
}

function TurnPresentationSegment({
  presentation,
  reasoningExecutionByMessageId,
  renderSlot,
  segment,
  turnId,
}: {
  presentation: ToolPresentation;
  reasoningExecutionByMessageId: ReadonlyMap<
    string,
    Extract<AgentExecution, { type: "reasoning" }>
  >;
  renderSlot: UIPluginComponentProps["renderSlot"];
  segment: AssistantTurnPresentationSegment;
  turnId: string;
}) {
  if (segment.kind === "tool-activity") {
    return (
      <div
        className="antd-x-message-list-turn-segment antd-x-message-list-segment--tool-activity"
        data-tool-activity-id={segment.id}
      >
        <ToolActivitySegment
          items={segment.items}
          presentation={presentation}
          renderSlot={renderSlot}
          turnId={turnId}
        />
      </div>
    );
  }

  return (
    <TurnMessageSegment
      message={segment.message}
      reasoningExecutionByMessageId={reasoningExecutionByMessageId}
      renderSlot={renderSlot}
      turnId={turnId}
    />
  );
}

function AssistantTurnContent({
  presentation,
  reasoningExecutionByMessageId,
  renderSlot,
  toolInspectionById,
  turn,
}: {
  presentation: ToolPresentation;
  reasoningExecutionByMessageId: ReadonlyMap<
    string,
    Extract<AgentExecution, { type: "reasoning" }>
  >;
  renderSlot: UIPluginComponentProps["renderSlot"];
  toolInspectionById: ReadonlyMap<string, ToolCallInspection>;
  turn: AgentTurn;
}) {
  const segments = projectTurnToolActivities(
    turn.responseMessages,
    toolInspectionById,
  );
  return (
    <div className="antd-x-message-list-turn-content">
      {segments.map((segment) => (
        <TurnPresentationSegment
          key={segment.id}
          presentation={presentation}
          reasoningExecutionByMessageId={reasoningExecutionByMessageId}
          renderSlot={renderSlot}
          segment={segment}
          turnId={turn.id}
        />
      ))}
    </div>
  );
}

function toTurnBubbleItems({
  presentation,
  reasoningExecutionByMessageId,
  renderSlot,
  toolInspectionById,
  turn,
  running,
}: {
  presentation: ToolPresentation;
  reasoningExecutionByMessageId: ReadonlyMap<
    string,
    Extract<AgentExecution, { type: "reasoning" }>
  >;
  renderSlot: UIPluginComponentProps["renderSlot"];
  toolInspectionById: ReadonlyMap<string, ToolCallInspection>;
  turn: AgentTurn;
  running: boolean;
}): BubbleItemType[] {
  const userBubble: BubbleItemType = {
    key: turn.userMessage.id,
    role: "user",
    content: (
      <AgentMessage
        role="user"
        header={<MessageRoleLabel role="user" />}
      >
        {messageContent(turn.userMessage)}
      </AgentMessage>
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
    content: (
      <AgentMessage
        role="assistant"
        status={running ? "streaming" : "complete"}
        header={<MessageRoleLabel role="assistant" />}
        footer={running ? <AssistantTurnLoading /> : undefined}
        actions={text.length > 0 ? <MessageActions text={text} /> : undefined}
      >
        <AssistantTurnContent
          presentation={presentation}
          reasoningExecutionByMessageId={reasoningExecutionByMessageId}
          renderSlot={renderSlot}
          toolInspectionById={toolInspectionById}
          turn={turn}
        />
      </AgentMessage>
    ),
    "data-agent-turn-id": turn.id,
    "data-agent-turn-role": "assistant",
  };

  return [userBubble, assistantBubble];
}

const surfaceRole = {
  placement: "start",
  rootClassName: "antd-x-message-list-bubble--surface",
  variant: "borderless",
} as const;

const bubbleRoles: NonNullable<BubbleListProps["role"]> = {
  ai: surfaceRole,
  user: surfaceRole,
  system: surfaceRole,
};

export function AntdXMessageListPlugin({
  renderSlot,
}: UIPluginComponentProps) {
  const messages = useAgentMessages();
  const executions = useAgentExecutions();
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
  const toolInspectionById = new Map(
    inspectToolCalls(conversationMessages, executions).map((inspection) => [
      inspection.id,
      inspection,
    ]),
  );
  const toolPresentation: ToolPresentation =
    instance.props?.toolPresentation === "flat" ? "flat" : "grouped";
  const reasoningExecutionByMessageId = new Map<
    string,
    Extract<AgentExecution, { type: "reasoning" }>
  >();
  executions.forEach((execution) => {
    if (execution.type !== "reasoning") return;
    execution.messageIds.forEach((messageId) => {
      reasoningExecutionByMessageId.set(messageId, execution);
    });
  });
  const items = leadingMessages
    .filter(isChatVisibleMessage)
    .filter(
      (message) =>
        !(
          message.role === "assistant" &&
          !hasRenderableAssistantContent(message)
        ),
    )
    .map(toLeadingBubbleItem);

  turns.forEach((turn, index) => {
    items.push(
      ...toTurnBubbleItems({
        presentation: toolPresentation,
        reasoningExecutionByMessageId,
        renderSlot,
        turn,
        toolInspectionById,
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
