import { createContext, useContext, type ReactNode } from "react";

import type {
  AgentExecution,
  AgentMessage,
  AgentToolCall,
} from "../../framework/contracts/ui-plugin";

export interface ReasoningRenderContext {
  kind: "reasoning";
  turnId?: string | undefined;
  message: Extract<AgentMessage, { role: "reasoning" }>;
  execution?: Extract<AgentExecution, { type: "reasoning" }> | undefined;
  status: ReasoningPresentationStatus;
  running: boolean;
}

export type ReasoningPresentationStatus =
  | "running"
  | "completed"
  | "error"
  | "interrupted";

export interface ToolRenderContext {
  kind: "tool";
  turnId?: string | undefined;
  toolCall: AgentToolCall;
  result?: Extract<AgentMessage, { role: "tool" }> | undefined;
  execution?: Extract<AgentExecution, { type: "tool" }> | undefined;
  status: ToolPresentationStatus;
  actionRequirement?: ToolActionRequirement | undefined;
  running: boolean;
}

export type ToolPresentationStatus =
  | "loading"
  | "success"
  | "error"
  | "abort";

export interface ToolActionRequirement {
  reason: "tool-calls" | "interrupt";
}

export interface ToolPresentationItem {
  toolCall: AgentToolCall;
  result?: Extract<AgentMessage, { role: "tool" }> | undefined;
  execution?: Extract<AgentExecution, { type: "tool" }> | undefined;
  status: ToolPresentationStatus;
  actionRequirement?: ToolActionRequirement | undefined;
}

export type ToolPresentation = "grouped" | "flat";

export type ToolActivityStatus =
  | "running"
  | "completed"
  | "error"
  | "interrupted"
  | "requires-action";

export interface ToolActivityRenderContext {
  kind: "tool-activity";
  turnId: string;
  presentation: ToolPresentation;
  items: readonly ToolPresentationItem[];
  status: ToolActivityStatus;
  activeToolCallIds: readonly string[];
  requiresActionToolCallIds: readonly string[];
}

export type MessageAttachmentKind = "image" | "audio" | "video" | "file";

export interface MessageAttachmentRenderItem {
  key: string;
  name: string;
  kind: MessageAttachmentKind;
  href?: string | undefined;
}

export interface MessageAttachmentsRenderContext {
  kind: "attachments";
  turnId?: string | undefined;
  message: AgentMessage;
  items: readonly MessageAttachmentRenderItem[];
}

export interface MessageSourceRenderItem {
  key: string;
  title: string;
  href?: string | undefined;
  description?: string | undefined;
}

export interface MessageSourcesRenderContext {
  kind: "sources";
  turnId?: string | undefined;
  message: AgentMessage;
  items: readonly MessageSourceRenderItem[];
}

export type MessageRenderContext =
  | ReasoningRenderContext
  | ToolRenderContext
  | ToolActivityRenderContext
  | MessageAttachmentsRenderContext
  | MessageSourcesRenderContext;

const MessageRenderReactContext =
  createContext<MessageRenderContext | null>(null);

export function MessageRenderProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: MessageRenderContext;
}) {
  return (
    <MessageRenderReactContext.Provider value={value}>
      {children}
    </MessageRenderReactContext.Provider>
  );
}

export function useMessageRenderContext(): MessageRenderContext {
  const context = useContext(MessageRenderReactContext);
  if (context === null) {
    throw new Error(
      "Message renderer plugins must be rendered inside MessageRenderProvider",
    );
  }
  return context;
}

export function useReasoningRenderContext(): ReasoningRenderContext {
  const context = useMessageRenderContext();
  if (context.kind !== "reasoning") {
    throw new Error(
      `Reasoning renderer received message render kind "${context.kind}"`,
    );
  }
  return context;
}

export function useToolRenderContext(): ToolRenderContext {
  const context = useMessageRenderContext();
  if (context.kind !== "tool") {
    throw new Error(`Tool renderer received message render kind "${context.kind}"`);
  }
  return context;
}

export function useToolActivityRenderContext(): ToolActivityRenderContext {
  const context = useMessageRenderContext();
  if (context.kind !== "tool-activity") {
    throw new Error(
      `Tool activity renderer received message render kind "${context.kind}"`,
    );
  }
  return context;
}

export function useMessageAttachmentsRenderContext(): MessageAttachmentsRenderContext {
  const context = useMessageRenderContext();
  if (context.kind !== "attachments") {
    throw new Error(
      `Attachments renderer received message render kind "${context.kind}"`,
    );
  }
  return context;
}

export function useMessageSourcesRenderContext(): MessageSourcesRenderContext {
  const context = useMessageRenderContext();
  if (context.kind !== "sources") {
    throw new Error(
      `Sources renderer received message render kind "${context.kind}"`,
    );
  }
  return context;
}
