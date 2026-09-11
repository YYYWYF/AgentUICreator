import {
  projectAgentTurns,
  type AgentTurn,
} from "@agent-ui/runtime-core";
import { useRef, type ReactElement } from "react";

import {
  AgentMessage,
  type AgentMessageRole,
} from "../../agent-ui/components/message";
import { AgentThread } from "../../agent-ui/components/thread";
import { Button } from "../../agent-ui/primitives/button";
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
  type MessageAttachmentKind,
  type MessageAttachmentRenderItem,
  type MessageSourceRenderItem,
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
import {
  MessageEmptyState,
  MessageErrorState,
  MessageLoadingState,
} from "./message-auxiliary";
import { MessageCopyAction } from "./message-copy-action";
import { useThreadFollowLatest } from "./thread-follow-latest";

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

function safeHref(
  value: string | undefined,
  allowedProtocols: readonly string[],
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  try {
    const parsed = new URL(value);
    return allowedProtocols.includes(parsed.protocol) ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

function messageAttachments(
  message: RuntimeAgentMessage,
): MessageAttachmentRenderItem[] {
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
    const kind: MessageAttachmentKind =
      part.type === "image"
        ? "image"
        : part.type === "audio"
          ? "audio"
          : part.type === "video"
            ? "video"
            : "file";

    const rawHref =
      source?.type === "url" && typeof source.value === "string"
        ? source.value
        : typeof partRecord?.url === "string"
          ? partRecord.url
          : undefined;
    const href = safeHref(rawHref, ["http:", "https:", "blob:"]);

    return [{
      key: `${message.id}-${index}`,
      name,
      kind,
      ...(href === undefined ? {} : { href }),
    }];
  });
}

function messageSources(message: RuntimeAgentMessage): MessageSourceRenderItem[] {
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
    const href = safeHref(
      typeof record.url === "string" ? record.url : undefined,
      ["http:", "https:"],
    );
    return [{
      key: typeof record.key === "string" ? record.key : `source-${index}`,
      title,
      ...(href === undefined ? {} : { href }),
      ...(typeof record.description === "string"
        ? { description: record.description }
        : {}),
    }];
  });
}

function MessageActions({ text }: { text: string }) {
  return <MessageCopyAction text={text} />;
}

const attachmentKindLabels: Record<MessageAttachmentKind, string> = {
  image: "IMG",
  audio: "AUD",
  video: "VID",
  file: "FILE",
};

function AttachmentFallbackRenderer({
  items,
}: {
  items: readonly MessageAttachmentRenderItem[];
}) {
  return (
    <ul
      className="agent-message-list-attachments"
      data-slot="agent-message-attachments-fallback"
    >
      {items.map((item) => (
        <li
          className="agent-message-list-attachment"
          data-kind={item.kind}
          data-slot="agent-message-attachment-fallback"
          key={item.key}
        >
          {item.href === undefined ? (
            <>
              <span className="agent-message-list-attachment-type">
                {attachmentKindLabels[item.kind]}
              </span>
              <span className="agent-message-list-attachment-name">{item.name}</span>
            </>
          ) : (
            <a href={item.href} target="_blank" rel="noreferrer">
              <span className="agent-message-list-attachment-type">
                {attachmentKindLabels[item.kind]}
              </span>
              <span className="agent-message-list-attachment-name">{item.name}</span>
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

function SourcesFallbackRenderer({
  items,
}: {
  items: readonly MessageSourceRenderItem[];
}) {
  return (
    <section
      className="agent-message-list-sources"
      data-slot="agent-message-sources-fallback"
    >
      <header>{items.length} 个来源</header>
      <ol className="agent-message-list-source-list">
        {items.map((item) => (
          <li
            className="agent-message-list-source"
            data-slot="agent-message-source-fallback"
            key={item.key}
          >
            {item.href === undefined ? (
              <span>{item.title}</span>
            ) : (
              <a href={item.href} target="_blank" rel="noreferrer">
                {item.title}
              </a>
            )}
            {item.description === undefined ? null : (
              <p className="agent-message-list-source-description">
                {item.description}
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function messageContent(
  message: RuntimeAgentMessage,
  renderSlot: UIPluginComponentProps["renderSlot"],
  turnId?: string,
) {
  const text = messageText(message);
  const attachments = messageAttachments(message);
  const sources = messageSources(message);

  if (
    text.length === 0 &&
    attachments.length === 0 &&
    sources.length === 0
  ) {
    return (
      <p className="agent-message-list-text">
        暂不支持此消息内容
      </p>
    );
  }

  return (
    <div className="agent-message-list-rich-content">
      {text.length === 0 ? null : (
        <p className="agent-message-list-text">{text}</p>
      )}
      {attachments.length === 0 ? null : (
        <MessageRenderProvider
          value={{ kind: "attachments", message, turnId, items: attachments }}
        >
          {renderSlot(
            "conversation.message.attachments",
            <AttachmentFallbackRenderer items={attachments} />,
          )}
        </MessageRenderProvider>
      )}
      {sources.length === 0 ? null : (
        <MessageRenderProvider
          value={{ kind: "sources", message, turnId, items: sources }}
        >
          {renderSlot(
            "conversation.message.sources",
            <SourcesFallbackRenderer items={sources} />,
          )}
        </MessageRenderProvider>
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
    <span className="agent-message-list-role">
      {roleLabels[role] ?? role}
    </span>
  );
}

function renderLeadingThreadItem({
  message,
  renderSlot,
}: {
  message: RuntimeAgentMessage;
  renderSlot: UIPluginComponentProps["renderSlot"];
}): ReactElement {
  const text = messageText(message);
  return (
    <div
      className="agent-message-list-thread-item"
      data-agent-message-id={message.id}
      key={message.id}
    >
      <AgentMessage
        role={presentationRole(message.role)}
        header={<MessageRoleLabel role={message.role} />}
        actions={
          message.role === "assistant" && text.length > 0
            ? <MessageActions text={text} />
            : undefined
        }
      >
        {messageContent(message, renderSlot)}
      </AgentMessage>
    </div>
  );
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
    <span className="agent-message-list-turn-loading">
      智能体正在处理…
    </span>
  );
}

function SegmentLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="agent-message-list-segment-label">
      {children}
    </div>
  );
}

function ToolActivityFallbackRenderer({
  items,
}: {
  items: readonly ToolPresentationItem[];
}) {
  return (
    <div
      className="agent-message-list-tool-activity-fallback"
      data-slot="agent-message-tool-activity-fallback"
    >
      <SegmentLabel>工具活动</SegmentLabel>
      <div className="agent-message-list-tool-activity-fallback-items">
        {items.map((item) => (
          <div
            className="agent-message-list-tool-activity-fallback-item"
            data-slot="agent-message-tool-activity-fallback-item"
            data-status={item.status}
            key={item.toolCall.id}
          >
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
    </div>
  );
}

function AssistantMessageSegment({
  message,
  renderSlot,
  turnId,
}: {
  message: AgentAssistantMessage;
  renderSlot: UIPluginComponentProps["renderSlot"];
  turnId: string;
}) {
  const text = messageText(message);
  const sources = messageSources(message);
  const hasContent = text.length > 0 || sources.length > 0;

  return (
    <>
      {hasContent ? messageContent(message, renderSlot, turnId) : null}
      {!hasContent && (message.toolCalls?.length ?? 0) === 0
        ? messageContent(message, renderSlot, turnId)
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
      className={`agent-message-list-tool-result${
        message.error === undefined
          ? ""
          : " agent-message-list-tool-result--error"
      }`}
    >
      <SegmentLabel>
        {message.error === undefined ? "工具结果" : "工具执行失败"}
      </SegmentLabel>
      <div>{message.error ?? message.content}</div>
    </div>
  );
}

function ReasoningFallbackRenderer({
  message,
}: {
  message: Extract<RuntimeAgentMessage, { role: "reasoning" }>;
}) {
  return (
    <div
      className="agent-message-list-reasoning-fallback"
      data-slot="agent-message-reasoning-fallback"
    >
      <div className="agent-message-list-reasoning-fallback-label">
        思考
      </div>
      <div className="agent-message-list-reasoning-fallback-body">
        {message.content}
      </div>
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
    <div className="agent-message-list-activity-segment">
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
    <div className="agent-message-list-context-segment">
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
      content = (
        <AssistantMessageSegment
          message={message}
          renderSlot={renderSlot}
          turnId={turnId}
        />
      );
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
            <ReasoningFallbackRenderer message={message} />,
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
      content = messageContent(message, renderSlot, turnId);
      break;
  }

  return (
    <div
      className={`agent-message-list-turn-segment agent-message-list-segment--${message.role}`}
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
        <ToolActivityFallbackRenderer items={items} />,
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
        className="agent-message-list-turn-segment agent-message-list-segment--tool-activity"
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
    <div className="agent-message-list-turn-content">
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

function renderTurnThreadItems({
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
}): ReactElement[] {
  const userThreadItem = (
    <div
      className="agent-message-list-thread-item"
      data-agent-turn-id={turn.id}
      data-agent-turn-role="user"
      key={turn.userMessage.id}
    >
      <AgentMessage
        role="user"
        header={<MessageRoleLabel role="user" />}
      >
        {messageContent(turn.userMessage, renderSlot, turn.id)}
      </AgentMessage>
    </div>
  );
  if (turn.responseMessages.length === 0 && !running) {
    return [userThreadItem];
  }

  const text = assistantTurnText(turn);
  const assistantThreadItem = (
    <div
      className="agent-message-list-thread-item"
      data-agent-turn-id={turn.id}
      data-agent-turn-role="assistant"
      key={`assistant-turn:${turn.id}`}
    >
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
    </div>
  );

  return [userThreadItem, assistantThreadItem];
}

export function AgentMessageListPlugin({
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
  const threadItems = leadingMessages
    .filter(isChatVisibleMessage)
    .filter(
      (message) =>
        !(
          message.role === "assistant" &&
          !hasRenderableAssistantContent(message)
        ),
    )
    .map((message) => renderLeadingThreadItem({ message, renderSlot }));

  turns.forEach((turn, index) => {
    threadItems.push(
      ...renderTurnThreadItems({
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
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const threadResetKey =
    conversationSnapshot.mode === "history"
      ? [
          "history",
          conversationSnapshot.activeConversationId ?? "none",
          conversationSnapshot.detailStatus,
        ].join(":")
      : ["live", threadItems.length === 0 ? "empty" : "content"].join(":");
  const followLatest = useThreadFollowLatest({
    viewportRef,
    contentRef,
    resetKey: threadResetKey,
  });

  return (
    <section
      aria-label="智能体消息"
      className="agent-message-list-plugin"
      data-agent-run-status={run.status}
      data-conversation-mode={conversationSnapshot.mode}
      data-ui-plugin="agent-message-list"
    >
      {conversationSnapshot.mode === "history" &&
      conversationSnapshot.detailStatus === "loading" ? (
        <MessageLoadingState label="历史会话加载中" />
      ) : conversationSnapshot.mode === "history" &&
        conversationSnapshot.detailStatus === "error" ? (
        <MessageErrorState
          message={conversationSnapshot.detailError ?? "历史会话加载失败"}
        />
      ) : (
        <AgentThread
          viewportRef={viewportRef}
          contentRef={contentRef}
          empty={
            <MessageEmptyState text={emptyText} />
          }
          scrollToBottom={
            followLatest.showScrollToBottom ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={followLatest.scrollToBottom}
              >
                ↓ 回到底部
              </Button>
            ) : undefined
          }
        >
          {threadItems.length === 0 ? undefined : threadItems}
        </AgentThread>
      )}
    </section>
  );
}
