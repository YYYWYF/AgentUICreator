import {
  projectAssistantUiExecutions,
  projectAssistantUiMessages,
} from "@agent-ui/runtime-assistant-ui";
import {
  useAuiState,
  type ThreadMessage,
  type ReasoningMessagePart,
  type ToolCallMessagePart,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";

import type {
  AgentExecution,
  AgentMessage,
  AgentToolCall,
} from "../../../../framework/contracts/ui-plugin";
import {
  MessageRenderProvider,
  projectMessageAttachments,
  projectMessageSources,
  type ReasoningPresentationStatus,
  type ToolActionRequirement,
  type ToolActivityStatus,
  type ToolPresentationItem,
  type ToolPresentationStatus,
} from "../../../../runtime/message-rendering";
import { useAssistantUiPresentationConfig } from "../config";
import {
  ReasoningContent,
  ReasoningRoot,
  ReasoningText,
  ReasoningTrigger,
} from "../../../vendor/assistant-ui/components/assistant-ui/elements/reasoning.aui";
import { ToolFallback } from "../../../vendor/assistant-ui/components/assistant-ui/elements/tool-fallback.aui";
import {
  ToolGroupContent,
  ToolGroupRoot,
  ToolGroupTrigger,
} from "../../../vendor/assistant-ui/components/assistant-ui/elements/tool-group.aui";
import type { ThreadGroupPart } from "../../../vendor/assistant-ui/components/assistant-ui/elements/thread.aui";
import { useOptionalMessageSlotBridge } from "./MessageSlotBridgeContext";
import { SemanticSlotFallbackProvider } from "./SemanticSlotFallbackContext";
import { ASSISTANT_UI_CONVERSATION_SLOTS } from "./semantic-slots";
import { useOptionalToolItemSlotBridge } from "./ToolItemSlotBridgeContext";

type AssistantAgentMessage = Extract<AgentMessage, { role: "assistant" }>;
type ReasoningAgentMessage = Extract<AgentMessage, { role: "reasoning" }>;
type ToolExecution = Extract<AgentExecution, { type: "tool" }>;
type ToolResultMessage = Extract<AgentMessage, { role: "tool" }>;
type ToolProjectionProps = Pick<
  ToolCallMessagePartProps,
  | "toolCallId"
  | "toolName"
  | "args"
  | "argsText"
  | "isError"
  | "status"
>;

function useCurrentThreadMessage(): ThreadMessage {
  return useAuiState((state) => state.message as ThreadMessage);
}

function withPublicCustomMetadata(
  message: AgentMessage,
  source: ThreadMessage,
): AgentMessage {
  return Object.keys(source.metadata.custom).length === 0
    ? message
    : { ...message, metadata: source.metadata.custom };
}

function projectCurrentMessage(message: ThreadMessage): AgentMessage[] {
  return projectAssistantUiMessages([message]).map((projected) =>
    withPublicCustomMetadata(projected, message),
  );
}

function firstProjectedMessage(message: ThreadMessage): AgentMessage {
  const projected = projectCurrentMessage(message)[0];
  if (projected === undefined) {
    throw new Error(`Unable to project assistant-ui message "${message.id}"`);
  }
  return projected;
}

function withPublicSourceParts(
  projected: AgentMessage,
  source: ThreadMessage,
): AgentMessage {
  if (source.role !== "assistant") return projected;
  const sources = source.content.flatMap((part) => {
    if (part.type !== "source") return [];
    return [{
      key: part.id,
      title: part.title ?? part.url,
      ...(part.url === undefined ? {} : { url: part.url }),
    }];
  });
  if (sources.length === 0) return projected;
  const existing = Array.isArray(projected.metadata?.sources)
    ? projected.metadata.sources
    : [];
  return {
    ...projected,
    metadata: {
      ...projected.metadata,
      sources: [...existing, ...sources],
    },
  };
}

function projectAssistantContext(message: ThreadMessage): {
  assistant: AssistantAgentMessage | undefined;
  executions: ToolExecution[];
  projected: AgentMessage[];
} {
  const projected = projectCurrentMessage(message);
  return {
    assistant: projected.find(
      (candidate): candidate is AssistantAgentMessage =>
        candidate.role === "assistant" && candidate.id === message.id,
    ),
    executions: projectAssistantUiExecutions([message]).filter(
      (execution): execution is ToolExecution => execution.type === "tool",
    ),
    projected,
  };
}

export function projectReasoningStatus(
  status: ThreadGroupPart["status"],
): ReasoningPresentationStatus {
  if (status.type === "running") return "running";
  if (status.type === "complete") return "completed";
  if (status.type === "incomplete" && status.reason === "error") {
    return "error";
  }
  return "interrupted";
}

export function projectToolPresentationStatus(
  status: ToolProjectionProps["status"],
  isError: boolean | undefined,
): ToolPresentationStatus {
  if (status.type === "running") return "loading";
  if (status.type === "complete") return isError === true ? "error" : "success";
  if (
    status.type === "incomplete" &&
    (status.reason === "error" || status.error !== undefined || isError === true)
  ) {
    return "error";
  }
  return "abort";
}

function projectToolItemProjection(
  message: ThreadMessage,
  props: ToolProjectionProps,
): ToolPresentationItem {
  const { assistant, executions, projected } = projectAssistantContext(message);
  const toolCall: AgentToolCall = assistant?.toolCalls?.find(
    (candidate) => candidate.id === props.toolCallId,
  ) ?? {
    id: props.toolCallId,
    type: "function",
    function: {
      name: props.toolName,
      arguments: props.argsText || JSON.stringify(props.args) || "",
    },
  };
  const execution = executions.find((candidate) => candidate.id === props.toolCallId);
  const result = projected.find(
    (candidate): candidate is ToolResultMessage =>
      candidate.role === "tool" && candidate.toolCallId === props.toolCallId,
  );
  const actionRequirement: ToolActionRequirement | undefined =
    props.status.type === "requires-action"
      ? { reason: props.status.reason }
      : undefined;
  return {
    toolCall,
    ...(result === undefined ? {} : { result }),
    ...(execution === undefined ? {} : { execution }),
    status: projectToolPresentationStatus(props.status, props.isError),
    ...(actionRequirement === undefined ? {} : { actionRequirement }),
  };
}

function projectToolItem(
  message: ThreadMessage,
  props: ToolCallMessagePartProps,
): ToolPresentationItem {
  return projectToolItemProjection(message, props);
}

function projectGroupedToolItem(
  message: ThreadMessage,
  part: ToolCallMessagePart,
  groupStatus: ThreadGroupPart["status"],
): ToolPresentationItem {
  return projectToolItemProjection(message, {
    ...part,
    status: part.result === undefined ? groupStatus : { type: "complete" },
  });
}

export function deriveToolActivityStatus(items: readonly ToolPresentationItem[]): {
  activeToolCallIds: readonly string[];
  requiresActionToolCallIds: readonly string[];
  status: ToolActivityStatus;
} {
  const activeToolCallIds = items.flatMap((item) =>
    item.status === "loading" && item.actionRequirement === undefined
      ? [item.toolCall.id]
      : [],
  );
  const requiresActionToolCallIds = items.flatMap((item) =>
    item.actionRequirement === undefined ? [] : [item.toolCall.id],
  );
  if (requiresActionToolCallIds.length > 0) {
    return {
      activeToolCallIds,
      requiresActionToolCallIds,
      status: "requires-action",
    };
  }
  if (activeToolCallIds.length > 0) {
    return { activeToolCallIds, requiresActionToolCallIds, status: "running" };
  }
  if (items.some((item) => item.status === "error")) {
    return { activeToolCallIds, requiresActionToolCallIds, status: "error" };
  }
  if (items.some((item) => item.status === "abort")) {
    return {
      activeToolCallIds,
      requiresActionToolCallIds,
      status: "interrupted",
    };
  }
  return { activeToolCallIds, requiresActionToolCallIds, status: "completed" };
}

interface ToolActivityItemRegistry {
  register(item: ToolPresentationItem): void;
}

const ToolActivityItemRegistryContext =
  createContext<ToolActivityItemRegistry | null>(null);

function useToolActivityItemProjection(
  initialItems: readonly ToolPresentationItem[],
): {
  items: readonly ToolPresentationItem[];
  registry: ToolActivityItemRegistry;
} {
  const [reportedItems, setReportedItems] = useState<
    Readonly<Record<string, ToolPresentationItem>>
  >({});
  const register = useCallback((item: ToolPresentationItem) => {
    setReportedItems((previous) => {
      const existing = previous[item.toolCall.id];
      if (
        existing?.status === item.status &&
        existing?.result === item.result &&
        existing?.execution === item.execution &&
        existing?.actionRequirement?.reason === item.actionRequirement?.reason
      ) {
        return previous;
      }
      return { ...previous, [item.toolCall.id]: item };
    });
  }, []);
  const registry = useMemo(() => ({ register }), [register]);
  const items = initialItems.map(
    (item) => reportedItems[item.toolCall.id] ?? item,
  );
  return { items, registry };
}

function useAssistantUiToolGroupDisclosure(
  requiresActionToolCallIds: readonly string[],
) {
  const [expanded, setExpanded] = useState(false);
  const lastActionRequirementKeyRef = useRef("");
  const actionRequirementKey = requiresActionToolCallIds.join("|");

  useEffect(() => {
    if (actionRequirementKey.length === 0) {
      lastActionRequirementKeyRef.current = "";
      return;
    }
    if (lastActionRequirementKeyRef.current !== actionRequirementKey) {
      lastActionRequirementKeyRef.current = actionRequirementKey;
      setExpanded(true);
    }
  }, [actionRequirementKey]);

  return { expanded, onExpandedChange: setExpanded };
}

function groupParts(
  message: ThreadMessage,
  group: ThreadGroupPart,
  type: "reasoning",
): ReasoningMessagePart[];
function groupParts(
  message: ThreadMessage,
  group: ThreadGroupPart,
  type: "tool-call",
): ToolCallMessagePart[];
function groupParts(
  message: ThreadMessage,
  group: ThreadGroupPart,
  type: "reasoning" | "tool-call",
): Array<ReasoningMessagePart | ToolCallMessagePart> {
  if (message.role !== "assistant") return [];
  return group.indices.flatMap((index) => {
    const part = message.content[index];
    return part?.type === type ? [part] : [];
  });
}

export function SemanticReasoningOutlet({
  children,
  group,
}: PropsWithChildren<{ group: ThreadGroupPart }>) {
  const renderSlot = useOptionalMessageSlotBridge();
  const threadMessage = useCurrentThreadMessage();
  const projectedReasoning = projectCurrentMessage(threadMessage).filter(
    (message): message is ReasoningAgentMessage => message.role === "reasoning",
  );
  const reasoningParts = groupParts(threadMessage, group, "reasoning");
  const firstPartIndex = group.indices[0] ?? 0;
  const firstReasoningOrdinal =
    threadMessage.role === "assistant"
      ? threadMessage.content
          .slice(0, firstPartIndex)
          .filter((part) => part.type === "reasoning").length
      : 0;
  const selected = projectedReasoning.slice(
    firstReasoningOrdinal,
    firstReasoningOrdinal + reasoningParts.length,
  );
  const status = projectReasoningStatus(group.status);
  const running = status === "running";
  const message: ReasoningAgentMessage = {
    id: `${threadMessage.id}:reasoning-group:${group.indices.join("-")}`,
    role: "reasoning",
    producer: { type: "root" },
    content: selected.map((part) => part.content).join(""),
    streamStatus: running ? "streaming" : "completed",
  };
  const fallback = (
    <ReasoningRoot streaming={running}>
      <ReasoningTrigger active={running} />
      <ReasoningContent aria-busy={running}>
        <ReasoningText>{children}</ReasoningText>
      </ReasoningContent>
    </ReasoningRoot>
  );
  if (renderSlot === null) return fallback;

  return (
    <MessageRenderProvider
      value={{
        kind: "reasoning",
        message,
        status,
        running,
        turnId: threadMessage.id,
      }}
    >
      {renderSlot(ASSISTANT_UI_CONVERSATION_SLOTS.reasoning, fallback)}
    </MessageRenderProvider>
  );
}

export function SemanticToolActivityOutlet({
  children,
  group,
}: PropsWithChildren<{ group: ThreadGroupPart }>) {
  const renderSlot = useOptionalMessageSlotBridge();
  const threadMessage = useCurrentThreadMessage();
  const initialItems = groupParts(threadMessage, group, "tool-call").map((part) =>
    projectGroupedToolItem(threadMessage, part, group.status),
  );
  const { items, registry } = useToolActivityItemProjection(initialItems);
  const {
    activeToolCallIds,
    requiresActionToolCallIds,
    status,
  } = deriveToolActivityStatus(items);
  const disclosure = useAssistantUiToolGroupDisclosure(
    requiresActionToolCallIds,
  );
  const presentationConfig = useAssistantUiPresentationConfig();
  const fallback = (
    <ToolGroupRoot
      variant={presentationConfig.interactions.toolGroupVariant}
      open={disclosure.expanded}
      onOpenChange={disclosure.onExpandedChange}
    >
      <ToolGroupTrigger
        count={items.length}
        active={activeToolCallIds.length > 0}
      />
      <ToolActivityItemRegistryContext.Provider value={registry}>
        <ToolGroupContent keepMounted>{children}</ToolGroupContent>
      </ToolActivityItemRegistryContext.Provider>
    </ToolGroupRoot>
  );
  if (renderSlot === null) return fallback;

  return (
    <MessageRenderProvider
      value={{
        activeToolCallIds,
        items,
        kind: "tool-activity",
        presentation: "grouped",
        status,
        turnId: threadMessage.id,
        requiresActionToolCallIds,
      }}
    >
      <SemanticSlotFallbackProvider
        fallback={fallback}
        slotId={ASSISTANT_UI_CONVERSATION_SLOTS.toolActivity}
      >
        {renderSlot(ASSISTANT_UI_CONVERSATION_SLOTS.toolActivity, fallback)}
      </SemanticSlotFallbackProvider>
    </MessageRenderProvider>
  );
}

export function SemanticToolItemOutlet(props: ToolCallMessagePartProps) {
  const renderSlot = useOptionalToolItemSlotBridge();
  const threadMessage = useCurrentThreadMessage();
  const item = projectToolItem(threadMessage, props);
  const registry = useContext(ToolActivityItemRegistryContext);
  useEffect(() => {
    registry?.register(item);
  }, [
    item.actionRequirement?.reason,
    item.execution?.id,
    item.execution?.status,
    item.result?.id,
    item.result?.content,
    item.result?.error,
    item.status,
    item.toolCall.id,
    item.toolCall.function.arguments,
    item.toolCall.function.name,
    registry,
  ]);
  const fallback = <ToolFallback {...props} />;
  if (props.status.type === "requires-action") return fallback;
  if (renderSlot === null) return fallback;

  return (
    <MessageRenderProvider
      value={{
        kind: "tool",
        status: item.status,
        running: item.status === "loading",
        toolCall: item.toolCall,
        turnId: threadMessage.id,
        ...(item.actionRequirement === undefined
          ? {}
          : { actionRequirement: item.actionRequirement }),
        ...(item.execution === undefined ? {} : { execution: item.execution }),
        ...(item.result === undefined ? {} : { result: item.result }),
      }}
    >
      {renderSlot(ASSISTANT_UI_CONVERSATION_SLOTS.toolItem, fallback)}
    </MessageRenderProvider>
  );
}

function projectedAttachmentMessage(threadMessage: ThreadMessage): AgentMessage {
  const projected = firstProjectedMessage(threadMessage);
  if (threadMessage.role !== "user" || threadMessage.attachments.length === 0) {
    return projected;
  }
  const attachmentProjection = projectAssistantUiMessages([{
    ...threadMessage,
    content: threadMessage.attachments.flatMap((attachment) =>
      attachment.content.map((part) =>
        (part.type === "image" || part.type === "file") &&
        part.filename === undefined
          ? { ...part, filename: attachment.name }
          : part,
      ),
    ),
  }])[0];
  return attachmentProjection === undefined
    ? projected
    : withPublicCustomMetadata(attachmentProjection, threadMessage);
}

export function SemanticAttachmentsOutlet({ children }: PropsWithChildren) {
  const renderSlot = useOptionalMessageSlotBridge();
  const threadMessage = useCurrentThreadMessage();
  const message = projectedAttachmentMessage(threadMessage);
  const items = projectMessageAttachments(message);
  if (renderSlot === null) return children;
  if (items.length === 0) return children;

  return (
    <MessageRenderProvider
      value={{
        items,
        kind: "attachments",
        message,
        turnId: threadMessage.id,
      }}
    >
      {renderSlot(ASSISTANT_UI_CONVERSATION_SLOTS.attachments, children)}
    </MessageRenderProvider>
  );
}

export function SemanticSourcesOutlet(): ReactNode {
  const renderSlot = useOptionalMessageSlotBridge();
  const threadMessage = useCurrentThreadMessage();
  const message = withPublicSourceParts(
    firstProjectedMessage(threadMessage),
    threadMessage,
  );
  const items = projectMessageSources(message);
  if (renderSlot === null) return null;
  if (items.length === 0) return null;

  return (
    <MessageRenderProvider
      value={{
        items,
        kind: "sources",
        message,
        turnId: threadMessage.id,
      }}
    >
      {renderSlot(ASSISTANT_UI_CONVERSATION_SLOTS.sources, null)}
    </MessageRenderProvider>
  );
}
