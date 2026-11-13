import type { ConversationTransientMessagesRenderScope } from "../conversation-support/conversation-transient-messages.js";
import type { ComponentType, ReactNode } from "react";
import { defineToolkit, useAuiState } from "@assistant-ui/react";
export type {ConversationMessage} from "../threads/types.js";
import type {ConversationMessage} from "../threads/types.js";

export type ConversationThreadComponents = {
  TransientMessages?:
    | ComponentType<ConversationTransientMessagesRenderScope>
    | undefined;
  UserEditComposer?: ComponentType | undefined;
  AssistantMessage?: ComponentType | undefined;
  AssistantResponseFooter?: ComponentType | undefined;
  Welcome?: ComponentType | undefined;
  ToolFallback?: ComponentType<ConversationToolCallProps> | undefined;
  ThinkingIndicator?:
    | ComponentType<ConversationThinkingIndicatorRenderScope>
    | undefined;
  reasoningVisible?: boolean | undefined;
  ToolTimeline?: ComponentType<{ children?: ReactNode }> | undefined;
  ToolGroup?:
    | ComponentType<{ children?: ReactNode; group: unknown }>
    | undefined;
  ReasoningGroup?:
    | ComponentType<{ children?: ReactNode; group: unknown }>
    | undefined;
  TaskGroup?:
    | ComponentType<{ children?: ReactNode; group: unknown }>
    | undefined;
};

export interface ConversationMessagePartGroup {
  readonly type: "group-reasoning" | "group-tool";
  readonly indices: readonly number[];
  readonly status: { readonly type: string };
  /** Presentation hint for pending tool actions, including runtime command decisions. */
  readonly requiresAction?: boolean;
}

export interface ConversationReasoningGroupRenderScope {
  readonly group: ConversationMessagePartGroup;
  readonly children: ReactNode;
}

export interface ConversationToolGroupRenderScope {
  readonly group: ConversationMessagePartGroup;
  readonly children: ReactNode;
}

export interface ConversationToolFallbackRenderScope {
  readonly tool: ConversationToolCallProps;
}

export interface ConversationTaskGroupRenderScope {
  readonly group: unknown;
  readonly children?: ReactNode;
}

export type ConversationUserEditComposerRenderScope = Record<string, never>;

export type ConversationAssistantResponseFooterRenderScope = Record<
  string,
  never
>;

export function toConversationMessagePartGroup(
  group: unknown,
): ConversationMessagePartGroup {
  const source = group as ConversationMessagePartGroup;
  return {
    type: source.type,
    indices: source.indices,
    status: source.status,
    ...(source.requiresAction === undefined
      ? {}
      : { requiresAction: source.requiresAction }),
  };
}

export type ConversationToolCallStatus =
  | { type: "running" }
  | { type: "complete" }
  | { type: "incomplete"; reason?: string; error?: unknown }
  | { type: "requires-action"; reason?: string };

export interface ConversationCommandDecisionRequest {
  description?: string | undefined;
  /** Decision types are supplied by the backend's review configuration. */
  allowedDecisions: readonly string[];
}

export interface ConversationCommandDecisionBinding {
  request: ConversationCommandDecisionRequest;
  submit: (decisionType: string) => Promise<void>;
}

export interface ConversationToolCallProps {
  type?: "tool-call" | undefined;
  toolCallId: string;
  toolName: string;
  args: unknown;
  argsText?: string | undefined;
  result?: unknown;
  messages?: readonly ConversationMessage[];
  isError?: boolean | undefined;
  status: ConversationToolCallStatus;
  addResult?: ((result: unknown) => void) | undefined;
  /** Resume the pending lifecycle interrupt; never writes a client ToolMessage. */
  resumeInterrupt?: ((payload: unknown) => Promise<void>) | undefined;
  /** Legacy ON_INTERRUPT decision data projected by the Agent UI Runtime. */
  decisionRequest?: ConversationCommandDecisionRequest | undefined;
  /** Submit a selected backend-provided decision using the interaction's transport. */
  submitDecision?: ((decisionType: string) => Promise<void>) | undefined;
  /** Preserve assistant-ui extension fields and callbacks at the facade seam. */
  readonly [key: string]: unknown;
}

export type ConversationToolCallComponent =
  ComponentType<ConversationToolCallProps>;

export interface ConversationToolkitEntry {
  /** Interrupt resumes a structured lifecycle; command handles legacy ON_INTERRUPT decisions. */
  interaction?: { type: "normal" | "interrupt" | "command" } | undefined;
  type: "backend" | "human";
  display: "standalone";
  render: ComponentType<any>;
  description?: string | undefined;
  parameters?: Record<string, unknown> | undefined;
}

export type ConversationToolkit = Readonly<
  Record<string, ConversationToolkitEntry>
>;

export function createConversationToolkit(
  toolkit: ConversationToolkit,
): ConversationToolkit {
  return defineToolkit(toolkit as never) as unknown as ConversationToolkit;
}

export interface ConversationToolTimelineRenderScope {
  readonly children?: ReactNode;
}

export interface ConversationThinkingIndicatorRenderScope {
  readonly reasoningVisible: boolean;
  readonly timelineVisible: boolean;
}
export function useConversationCanAnswerToolCall(): boolean {
  return useAuiState((state) => state.thread.capabilities.answerToolCall);
}
