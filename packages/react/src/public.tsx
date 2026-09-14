import {
  Thread as InternalConversationThread,
  type ThreadComponents as InternalThreadComponents,
} from "./internal/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.js";
import { ToolCall as InternalToolCall } from "./internal/vendor/assistant-ui/components/assistant-ui/elements/tool-call.js";
import { ToolFallback as InternalToolFallback } from "./internal/vendor/assistant-ui/components/assistant-ui/elements/tool-fallback.aui.js";
import { MarkdownText as InternalMarkdownText } from "./internal/vendor/assistant-ui/components/assistant-ui/elements/markdown-text.js";
import { Reasoning as InternalReasoning } from "./internal/vendor/assistant-ui/components/assistant-ui/elements/reasoning.aui.js";
import {
  Collapsible as InternalCollapsible,
  CollapsibleContent as InternalCollapsibleContent,
  CollapsibleTrigger as InternalCollapsibleTrigger,
} from "./internal/vendor/assistant-ui/components/ui/collapsible.js";
import { Button as InternalButton } from "./internal/vendor/assistant-ui/components/ui/button.js";
import { TooltipProvider as InternalTooltipProvider } from "./internal/vendor/assistant-ui/components/ui/tooltip.js";
import {
  AuiIf as InternalConversationIf,
  MessagePartPrimitive,
  MessagePrimitive,
  ThreadListPrimitive as InternalConversationThreadListPrimitive,
  ThreadPrimitive,
  defineToolkit,
  useAuiState as useInternalConversationState,
  useAui,
} from "@assistant-ui/react";
import {
  ThreadListItem as InternalConversationThreadListItem,
  ThreadListNew as InternalConversationThreadListNew,
  ThreadListRoot as InternalConversationThreadListRoot,
  ThreadListSearch as InternalConversationThreadListSearch,
  useThreadListGroups as useInternalConversationThreadListGroups,
} from "./internal/vendor/assistant-ui/components/assistant-ui/elements/thread-list.aui.js";
import { AgentPlan as InternalAgentPlan } from "./internal/vendor/assistant-ui/components/assistant-ui/elements/agent-plan.js";
import { AgentStatus as InternalAgentStatus } from "./internal/vendor/assistant-ui/components/assistant-ui/elements/agent-status.js";
import { SubagentList as InternalSubagentList } from "./internal/vendor/assistant-ui/components/assistant-ui/elements/subagent-list.js";
import { Badge as InternalBadge } from "./internal/vendor/assistant-ui/components/ui/badge.js";
import { Input as InternalInput } from "./internal/vendor/assistant-ui/components/ui/input.js";
import { Skeleton as InternalSkeleton } from "./internal/vendor/assistant-ui/components/ui/skeleton.js";
import type {
  ComponentProps,
  ComponentType,
  ReactNode,
} from "react";
import { useMemo } from "react";

export interface ConversationMessage {
  readonly id: string;
  readonly role: "user" | "assistant" | "system";
  readonly content: readonly Record<string, unknown>[];
  readonly [key: string]: unknown;
}

export interface ConversationState {
  readonly threads: {
    readonly isLoading: boolean;
    readonly threadIds: readonly string[];
    readonly threadItems: readonly Record<string, unknown>[];
  };
  readonly threadListItem: {
    readonly isRunning?: boolean;
    readonly custom?: Record<string, unknown>;
  };
}

export function useConversationState<T>(
  selector: (state: ConversationState) => T,
): T {
  return useInternalConversationState(selector as never) as T;
}

export function ConversationIf({
  condition,
  children,
}: Readonly<{
  condition: (state: ConversationState) => boolean;
  children?: ReactNode;
}>) {
  return (
    <InternalConversationIf condition={condition as never}>
      {children}
    </InternalConversationIf>
  );
}

export type ConversationThreadComponents = {
  AssistantMessage?: ComponentType | undefined;
  Welcome?: ComponentType | undefined;
  ToolFallback?: ComponentType<ConversationToolCallProps> | undefined;
  ToolGroup?: ComponentType<{ children?: ReactNode; group: unknown }> | undefined;
  ReasoningGroup?: ComponentType<{ children?: ReactNode; group: unknown }> | undefined;
};

export interface ConversationThreadProps {
  components?: ConversationThreadComponents | undefined;
  autoFocus?: boolean | undefined;
}

export function ConversationThread({
  components,
  autoFocus,
}: Readonly<ConversationThreadProps>) {
  return (
    <InternalConversationThread
      {...(components === undefined
        ? {}
        : { components: components as unknown as InternalThreadComponents })}
      {...(autoFocus === undefined ? {} : { autoFocus })}
    />
  );
}

export interface ConversationSuggestionProps
  extends Omit<ComponentProps<"button">, "children"> {
  prompt: string;
  send?: boolean | undefined;
  children?: ReactNode;
}

export function ConversationSuggestion({
  prompt,
  send,
  children,
  ...props
}: Readonly<ConversationSuggestionProps>) {
  return (
    <ThreadPrimitive.Suggestion
      prompt={prompt}
      {...(send === undefined ? {} : { send })}
      {...props}
    >
      {children}
    </ThreadPrimitive.Suggestion>
  );
}

export type ConversationToolCallStatus =
  | { type: "running" }
  | { type: "complete" }
  | { type: "incomplete"; reason?: string; error?: unknown }
  | { type: "requires-action"; reason?: string };

export interface ConversationToolCallProps {
  type?: "tool-call" | undefined;
  toolCallId: string;
  toolName: string;
  args: unknown;
  argsText?: string | undefined;
  result?: unknown;
  isError?: boolean | undefined;
  status: ConversationToolCallStatus;
}

export type ConversationToolCallComponent = ComponentType<ConversationToolCallProps>;

export interface ConversationToolkitEntry {
  type: "backend";
  display: "standalone";
  render: ComponentType<any>;
}

export type ConversationToolkit = Readonly<Record<string, ConversationToolkitEntry>>;

export function createConversationToolkit(
  toolkit: ConversationToolkit,
): ConversationToolkit {
  return defineToolkit(toolkit as never) as unknown as ConversationToolkit;
}

export function ConversationToolCall(
  props: Readonly<{
    label: string;
    activeLabel: string;
    query: string;
    request: string;
    result: string;
    running: boolean;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    className?: string | undefined;
  }>,
) {
  return <InternalToolCall {...(props as ComponentProps<typeof InternalToolCall>)} />;
}

export function ConversationToolFallback(
  props: Readonly<ConversationToolCallProps>,
) {
  return <InternalToolFallback {...(props as ComponentProps<typeof InternalToolFallback>)} />;
}

export function ConversationMarkdownText() {
  return <InternalMarkdownText />;
}

export function ConversationReasoning() {
  return <InternalReasoning {...({} as ComponentProps<typeof InternalReasoning>)} />;
}

export interface ConversationThreadListGroup {
  label: string;
  indices: number[];
}

export interface ConversationThreadListGroups {
  threadIds: readonly string[];
  filteredIndices: readonly number[];
  groups: readonly ConversationThreadListGroup[] | null;
}

export function useConversationThreadListGroups(
  searchQuery = "",
): ConversationThreadListGroups {
  return useInternalConversationThreadListGroups(searchQuery) as unknown as ConversationThreadListGroups;
}

export function ConversationThreadListItem() {
  return <InternalConversationThreadListItem />;
}

export function ConversationThreadListNew(
  props: Readonly<React.ComponentProps<"button"> & { labelClassName?: string }>,
) {
  return <InternalConversationThreadListNew {...(props as ComponentProps<typeof InternalConversationThreadListNew>)} />;
}

export function ConversationThreadListRoot(
  props: Readonly<React.ComponentProps<"div">>,
) {
  return <InternalConversationThreadListRoot {...(props as ComponentProps<typeof InternalConversationThreadListRoot>)} />;
}

export function ConversationThreadListSearch(
  props: Readonly<React.ComponentProps<"input"> & {
    value: string;
    onValueChange: (value: string) => void;
  }>,
) {
  return <InternalConversationThreadListSearch {...(props as ComponentProps<typeof InternalConversationThreadListSearch>)} />;
}

export function ConversationThreadListItemByIndex({
  index,
  components,
}: Readonly<{
  index: number;
  components?: { ThreadListItem?: ComponentType };
}>) {
  return (
    <InternalConversationThreadListPrimitive.ItemByIndex
      index={index}
      components={components as never}
    />
  );
}

export interface ConversationAgentPlanProps
  extends Omit<React.ComponentProps<"div">, "children" | "steps" | "activeIndex"> {
  steps: readonly string[];
  activeIndex: number;
}

export function AgentPlan(props: Readonly<ConversationAgentPlanProps>) {
  return <InternalAgentPlan {...(props as ComponentProps<typeof InternalAgentPlan>)} />;
}

export type ConversationAgentStatusState = "working" | "waiting" | "done";

export interface ConversationAgentStatusProps
  extends Omit<React.ComponentProps<"div">, "children" | "state" | "label" | "elapsed"> {
  state: ConversationAgentStatusState;
  label: string;
  elapsed?: string;
}

export function AgentStatus(props: Readonly<ConversationAgentStatusProps>) {
  return <InternalAgentStatus {...(props as ComponentProps<typeof InternalAgentStatus>)} />;
}

export interface ConversationSubagentItem {
  name: string;
  model: string;
}

export interface ConversationSubagentListProps
  extends Omit<React.ComponentProps<"div">, "children" | "agents" | "completedCount" | "progress" | "showSummary" | "summaryAgent"> {
  agents: readonly ConversationSubagentItem[];
  completedCount: number;
  progress: readonly number[];
  showSummary: boolean;
  summaryAgent: ConversationSubagentItem;
}

export function SubagentList(props: Readonly<ConversationSubagentListProps>) {
  return <InternalSubagentList {...(props as ComponentProps<typeof InternalSubagentList>)} />;
}

export function ConversationSubagentMessages() {
  return (
    <MessagePartPrimitive.Messages>
      {() => (
        <MessagePrimitive.Root
          data-slot="conversation-nested-assistant-message"
          data-role="assistant"
          className="my-2 min-w-0"
        >
          <MessagePrimitive.Parts
            components={{
              Text: ConversationMarkdownText,
              Reasoning: ConversationReasoning,
              tools: { Fallback: ConversationToolFallback as never },
            }}
          />
        </MessagePrimitive.Root>
      )}
    </MessagePartPrimitive.Messages>
  );
}

export function useConversationNavigation(): ConversationNavigation {
  const runtime = useAui();
  return {
    switchToThread: async (threadId) => {
      runtime.threads.switchToThread(threadId);
    },
    switchToNewThread: async () => {
      runtime.threads.switchToNewThread();
    },
  };
}

export interface ConversationThreadSnapshot {
  messages: readonly ConversationMessage[];
  state?: unknown;
  isRunning: boolean;
}

export interface ConversationThreadController {
  getSnapshot(): ConversationThreadSnapshot;
  subscribe(listener: () => void): () => void;
}

export function useConversationThread(): ConversationThreadController {
  const runtime = useAui();
  return useMemo(
    () => ({
      getSnapshot: () => {
        const state = runtime.thread.getState();
        return {
          messages: state.messages as unknown as readonly ConversationMessage[],
          ...(state.state === undefined ? {} : { state: state.state }),
          isRunning: state.isRunning,
        };
      },
      subscribe: runtime.subscribe,
    }),
    [runtime],
  );
}

export function useConversationMessageParts(): readonly unknown[] {
  const runtime = useAui();
  return runtime.thread.getState().messages.flatMap(
    (message) => message.content as readonly unknown[],
  );
}

export interface ConversationNavigation {
  switchToThread(threadId: string): Promise<unknown>;
  switchToNewThread(): Promise<unknown>;
}

export type ConversationButtonVariant =
  | "default"
  | "outline"
  | "secondary"
  | "ghost"
  | "destructive"
  | "link";
export type ConversationButtonSize =
  | "default"
  | "xs"
  | "sm"
  | "lg"
  | "icon"
  | "icon-xs"
  | "icon-sm"
  | "icon-lg";

export function Button({
  variant,
  size,
  ...props
}: Readonly<React.ComponentProps<"button"> & {
  variant?: ConversationButtonVariant;
  size?: ConversationButtonSize;
}>) {
  return (
    <InternalButton
      {...props}
      {...(variant === undefined ? {} : { variant })}
      {...(size === undefined ? {} : { size })}
    />
  );
}

export type ConversationBadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "ghost"
  | "link";

export function Badge({
  variant,
  ...props
}: Readonly<React.ComponentProps<"span"> & {
  variant?: ConversationBadgeVariant;
}>) {
  return (
    <InternalBadge
      {...props}
      {...(variant === undefined ? {} : { variant })}
    />
  );
}

export function Input(props: Readonly<React.ComponentProps<"input">>) {
  return <InternalInput {...props} />;
}

export function Skeleton(props: Readonly<React.ComponentProps<"div">>) {
  return <InternalSkeleton {...props} />;
}

export interface ConversationCollapsibleProps
  extends React.ComponentProps<"div"> {
  open?: boolean;
  onOpenChange?: ((open: boolean) => void) | undefined;
}

export function Collapsible(props: Readonly<ConversationCollapsibleProps>) {
  return <InternalCollapsible {...(props as ComponentProps<typeof InternalCollapsible>)} />;
}

export function CollapsibleTrigger(
  props: Readonly<React.ComponentProps<"button">>,
) {
  return <InternalCollapsibleTrigger {...(props as ComponentProps<typeof InternalCollapsibleTrigger>)} />;
}

export function CollapsibleContent(
  props: Readonly<React.ComponentProps<"div">>,
) {
  return <InternalCollapsibleContent {...(props as ComponentProps<typeof InternalCollapsibleContent>)} />;
}

export function TooltipProvider(
  props: Readonly<React.ComponentProps<"div"> & { delay?: number }>,
) {
  return <InternalTooltipProvider {...(props as ComponentProps<typeof InternalTooltipProvider>)} />;
}
