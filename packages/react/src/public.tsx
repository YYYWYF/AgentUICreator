import {
  CanonicalComposer as InternalConversationCanonicalComposer,
  ComposerAddAttachmentAction as InternalConversationComposerAddAttachment,
  ComposerCancelAction as InternalConversationComposerCancel,
  ComposerDictateAction as InternalConversationComposerDictate,
  ComposerSendAction as InternalConversationComposerSend,
  ComposerStopDictationAction as InternalConversationComposerStopDictation,
  ComposableThread as InternalConversationThread,
  type CanonicalComposerProps as InternalCanonicalComposerProps,
  type ThreadComponents as InternalThreadComponents,
} from "./internal/composable-thread.js";
import { File as InternalFile } from "./internal/vendor/assistant-ui/components/assistant-ui/elements/file.js";
import { Image as InternalImage } from "./internal/vendor/assistant-ui/components/assistant-ui/elements/image.js";
import { ToolCall as InternalToolCall } from "./internal/vendor/assistant-ui/components/assistant-ui/elements/tool-call.js";
import { ToolFallback as InternalToolFallback } from "./internal/vendor/assistant-ui/components/assistant-ui/elements/tool-fallback.aui.js";
import { MarkdownText as InternalMarkdownText } from "./internal/vendor/assistant-ui/components/assistant-ui/elements/markdown-text.js";
import { Reasoning as InternalReasoning } from "./internal/vendor/assistant-ui/components/assistant-ui/elements/reasoning.aui.js";
import {
  ReasoningRoot as InternalReasoningRoot,
  ReasoningTrigger as InternalReasoningTrigger,
  ReasoningContent as InternalReasoningContent,
  ReasoningText as InternalReasoningText,
} from "./internal/vendor/assistant-ui/components/assistant-ui/elements/reasoning.aui.js";
import {
  ToolGroupRoot as InternalToolGroupRoot,
  ToolGroupTrigger as InternalToolGroupTrigger,
  ToolGroupContent as InternalToolGroupContent,
} from "./internal/vendor/assistant-ui/components/assistant-ui/elements/tool-group.aui.js";
import {
  Collapsible as InternalCollapsible,
  CollapsibleContent as InternalCollapsibleContent,
  CollapsibleTrigger as InternalCollapsibleTrigger,
} from "./internal/vendor/assistant-ui/components/ui/collapsible.js";
import { Button as InternalButton } from "./internal/vendor/assistant-ui/components/ui/button.js";
import {
  TooltipIconButton as InternalTooltipIconButton,
} from "./internal/vendor/assistant-ui/components/assistant-ui/elements/tooltip-icon-button.js";
import { TooltipProvider as InternalTooltipProvider } from "./internal/vendor/assistant-ui/components/ui/tooltip.js";
import {
  ActionBarPrimitive,
  AuiIf as InternalConversationIf,
  BranchPickerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  SuggestionPrimitive,
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
import {
  AgentStatus as InternalTaskAgentStatus,
  TaskTray as InternalTaskTray,
} from "./internal/vendor/assistant-ui/components/assistant-ui/elements/agent-status.aui.js";
import { SubagentList as InternalSubagentList } from "./internal/vendor/assistant-ui/components/assistant-ui/elements/subagent-list.js";
import { JobProgress as InternalJobProgress } from "./internal/vendor/assistant-ui/components/assistant-ui/elements/job-progress.js";
import { TaskGroup as InternalTaskGroup } from "./internal/vendor/assistant-ui/components/assistant-ui/elements/task-card.aui.js";
import { Badge as InternalBadge } from "./internal/vendor/assistant-ui/components/ui/badge.js";
import { Input as InternalInput } from "./internal/vendor/assistant-ui/components/ui/input.js";
import { Skeleton as InternalSkeleton } from "./internal/vendor/assistant-ui/components/ui/skeleton.js";
import type {
  ComponentProps,
  ComponentType,
  ReactElement,
  ReactNode,
} from "react";
import { useMemo } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  RefreshCwIcon,
} from "lucide-react";
import { cn } from "./internal/vendor/assistant-ui/lib/utils.js";
export {
  DataMessageUIRegistration,
  defineDataMessageUI,
  type DataMessageUIDefinition,
  type DataMessageUIRenderProps,
} from "./internal/data-message-ui.js";

export interface ConversationMessage {
  readonly id: string;
  readonly role: "user" | "assistant" | "system";
  readonly content: readonly Record<string, unknown>[];
  readonly [key: string]: unknown;
}

export interface ConversationState {
  readonly message: {
    readonly isCopied: boolean;
    readonly [key: string]: unknown;
  };
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
  AssistantResponseFooter?: ComponentType | undefined;
  /** @deprecated Use AssistantResponseFooter. */
  AssistantMessageFooter?: ComponentType | undefined;
  Welcome?: ComponentType | undefined;
  ToolFallback?: ComponentType<ConversationToolCallProps> | undefined;
  ToolGroup?: ComponentType<{ children?: ReactNode; group: unknown }> | undefined;
  ReasoningGroup?: ComponentType<{ children?: ReactNode; group: unknown }> | undefined;
  TaskGroup?: ComponentType<{ children?: ReactNode; group: unknown }> | undefined;
};

/** Stable metadata projected from assistant-ui GroupedParts at the facade edge. */
export interface ConversationMessagePartGroup {
  readonly type: "group-reasoning" | "group-tool";
  readonly indices: readonly number[];
  readonly status: { readonly type: string };
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

/** The footer keeps its scope intentionally data-free; actions read Response Context. */
export type ConversationAssistantResponseFooterRenderScope = Record<string, never>;
/** @deprecated Use ConversationAssistantResponseFooterRenderScope. */
export type ConversationAssistantMessageFooterRenderScope = ConversationAssistantResponseFooterRenderScope;

export function toConversationMessagePartGroup(group: unknown): ConversationMessagePartGroup {
  const source = group as { type: ConversationMessagePartGroup["type"]; indices: readonly number[]; status: { type: string } };
  return { type: source.type, indices: source.indices, status: source.status };
}

export interface ConversationThreadProps {
  components?: ConversationThreadComponents | undefined;
  autoFocus?: boolean | undefined;
  composer?: ReactNode | null | undefined;
}

export function ConversationThread({
  components,
  autoFocus,
  composer,
}: Readonly<ConversationThreadProps>) {
  return (
    <InternalConversationThread
      {...(components === undefined
        ? {}
        : { components: components as unknown as InternalThreadComponents })}
      {...(autoFocus === undefined ? {} : { autoFocus })}
      composer={composer}
    />
  );
}

export interface ConversationCanonicalComposerProps
  extends Omit<InternalCanonicalComposerProps, "placeholder" | "inputAriaLabel"> {
  placeholder?: string | undefined;
  inputAriaLabel?: string | undefined;
}

/**
 * Product-owned Composer composition. The host supplies semantic child Slot
 * content while assistant-ui owns the Root, attachment, input, and state.
 */
export function ConversationCanonicalComposer({
  placeholder = "Send a message...",
  inputAriaLabel = "Message input",
  ...props
}: Readonly<ConversationCanonicalComposerProps>) {
  return (
    <InternalConversationCanonicalComposer
      {...props}
      placeholder={placeholder}
      inputAriaLabel={inputAriaLabel}
    />
  );
}

export function ConversationComposerAddAttachment({ label = "Add Attachment" }: Readonly<{ label?: string }> = {}) {
  return <InternalConversationComposerAddAttachment label={label} />;
}

export interface ConversationComposerDictateProps {
  tooltip?: string | undefined;
  ariaLabel?: string | undefined;
  /**
   * Backward-compatible shorthand. Prefer tooltip + ariaLabel for exact
   * presentation control.
   */
  label?: string | undefined;
}

export function ConversationComposerDictate({
  tooltip,
  ariaLabel,
  label,
}: Readonly<ConversationComposerDictateProps> = {}) {
  return (
    <InternalConversationComposerDictate
      tooltip={tooltip ?? label ?? "Voice input"}
      ariaLabel={ariaLabel ?? label ?? "Start voice input"}
    />
  );
}

export interface ConversationComposerStopDictationProps {
  tooltip?: string | undefined;
  ariaLabel?: string | undefined;
  /**
   * Backward-compatible shorthand. Prefer tooltip + ariaLabel for exact
   * presentation control.
   */
  label?: string | undefined;
}

export function ConversationComposerStopDictation({
  tooltip,
  ariaLabel,
  label,
}: Readonly<ConversationComposerStopDictationProps> = {}) {
  return (
    <InternalConversationComposerStopDictation
      tooltip={tooltip ?? label ?? "Stop dictation"}
      ariaLabel={ariaLabel ?? label ?? "Stop voice input"}
    />
  );
}

export function ConversationComposerSend({ label = "Send message" }: Readonly<{ label?: string }> = {}) {
  return <InternalConversationComposerSend label={label} />;
}

export function ConversationComposerCancel({ label = "Stop generating" }: Readonly<{ label?: string }> = {}) {
  return <InternalConversationComposerCancel label={label} />;
}

export interface ConversationSuggestionProps
  extends Omit<ComponentProps<"button">, "children"> {
  /** A prompt for a genuinely hard-coded suggestion. Runtime suggestions use
   * ConversationSuggestionTrigger instead. */
  prompt: string;
  send?: boolean | undefined;
  children?: ReactNode;
}

export interface ConversationSuggestionsProps {
  children: () => ReactNode;
}

/**
 * Renders the current assistant-ui runtime suggestion scope through the
 * stable Agent UI facade.
 */
export function ConversationSuggestions({
  children,
}: Readonly<ConversationSuggestionsProps>) {
  return (
    <ThreadPrimitive.Suggestions>
      {() => children()}
    </ThreadPrimitive.Suggestions>
  );
}

export type ConversationSuggestionTriggerProps = ComponentProps<
  typeof SuggestionPrimitive.Trigger
>;

export function ConversationSuggestionTrigger(
  props: Readonly<ConversationSuggestionTriggerProps>,
) {
  return <SuggestionPrimitive.Trigger {...props} />;
}

export type ConversationSuggestionTitleProps = ComponentProps<
  typeof SuggestionPrimitive.Title
>;

export function ConversationSuggestionTitle(
  props: Readonly<ConversationSuggestionTitleProps>,
) {
  return <SuggestionPrimitive.Title {...props} />;
}

export type ConversationSuggestionDescriptionProps = ComponentProps<
  typeof SuggestionPrimitive.Description
>;

export function ConversationSuggestionDescription(
  props: Readonly<ConversationSuggestionDescriptionProps>,
) {
  return <SuggestionPrimitive.Description {...props} />;
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
  messages?: readonly ConversationMessage[];
  isError?: boolean | undefined;
  status: ConversationToolCallStatus;
  /** Preserve assistant-ui extension fields and callbacks at the facade seam. */
  readonly [key: string]: unknown;
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

export type ConversationTooltipIconButtonProps = ComponentProps<
  typeof InternalTooltipIconButton
>;

export function ConversationTooltipIconButton(
  props: Readonly<ConversationTooltipIconButtonProps>,
) {
  return <InternalTooltipIconButton {...props} />;
}

export function ConversationActionBarRoot({
  children,
}: Readonly<{ children?: ReactNode }>) {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-assistant-action-bar-root text-muted-foreground animate-in fade-in col-start-3 row-start-2 -ms-1 flex gap-1 duration-200"
    >
      {children}
    </ActionBarPrimitive.Root>
  );
}

export function ConversationActionCopy({
  children,
}: Readonly<{ children: ReactElement }>) {
  return <ActionBarPrimitive.Copy asChild>{children}</ActionBarPrimitive.Copy>;
}

export function ConversationActionReload({
  children,
}: Readonly<{ children: ReactElement }>) {
  return <ActionBarPrimitive.Reload asChild>{children}</ActionBarPrimitive.Reload>;
}

export function ConversationActionExportMarkdown({
  children,
}: Readonly<{ children: ReactElement }>) {
  return (
    <ActionBarPrimitive.ExportMarkdown asChild>
      {children}
    </ActionBarPrimitive.ExportMarkdown>
  );
}

export function ConversationCanonicalCopyAction() {
  return (
    <ConversationActionCopy>
      <ConversationTooltipIconButton tooltip="Copy">
        <ConversationIf condition={(state) => state.message.isCopied}>
          <CheckIcon
            data-slot="assistant-ui-copy-action-copied"
            className="animate-in zoom-in-50 fade-in duration-200 ease-out"
          />
        </ConversationIf>
        <ConversationIf condition={(state) => !state.message.isCopied}>
          <CopyIcon
            data-slot="assistant-ui-copy-action-idle"
            className="animate-in zoom-in-75 fade-in duration-150"
          />
        </ConversationIf>
      </ConversationTooltipIconButton>
    </ConversationActionCopy>
  );
}

export function ConversationCanonicalReloadAction() {
  return (
    <ConversationActionReload>
      <ConversationTooltipIconButton tooltip="Refresh">
        <RefreshCwIcon />
      </ConversationTooltipIconButton>
    </ConversationActionReload>
  );
}

export function ConversationCanonicalExportMarkdownAction() {
  return (
    <ConversationActionExportMarkdown>
      <ConversationTooltipIconButton tooltip="Export as Markdown" type="button">
        <DownloadIcon />
      </ConversationTooltipIconButton>
    </ConversationActionExportMarkdown>
  );
}

export interface ConversationBranchPickerProps
  extends Omit<ComponentProps<typeof BranchPickerPrimitive.Root>, "children"> {
  previousLabel?: string | undefined;
  nextLabel?: string | undefined;
}

export function ConversationBranchPicker({
  className,
  nextLabel = "Next",
  previousLabel = "Previous",
  ...rest
}: Readonly<ConversationBranchPickerProps>) {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        "aui-branch-picker-root text-muted-foreground -ms-2 me-2 inline-flex items-center text-xs",
        className,
      )}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <ConversationTooltipIconButton tooltip={previousLabel}>
          <ChevronLeftIcon />
        </ConversationTooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="aui-branch-picker-state font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <ConversationTooltipIconButton tooltip={nextLabel}>
          <ChevronRightIcon />
        </ConversationTooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
}

export function ConversationCanonicalMessageError() {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="aui-message-error-root border-destructive bg-destructive/10 text-destructive dark:bg-destructive/5 mt-2 rounded-md border p-3 text-sm dark:text-red-200">
        <ErrorPrimitive.Message className="aui-message-error-message line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
}

export function ConversationMarkdownText() {
  return <InternalMarkdownText />;
}

export function ConversationReasoning() {
  return <InternalReasoning {...({} as ComponentProps<typeof InternalReasoning>)} />;
}

export function ConversationCanonicalReasoningGroup({ group, children }: {
  group: ConversationMessagePartGroup;
  children: ReactNode;
}) {
  const running = group.status.type === "running";
  return (
    <InternalReasoningRoot className="mb-0" streaming={running}>
      <InternalReasoningTrigger active={running} />
      <InternalReasoningContent aria-busy={running}>
        <InternalReasoningText>{children}</InternalReasoningText>
      </InternalReasoningContent>
    </InternalReasoningRoot>
  );
}

export function ConversationCanonicalToolGroup({ group, children }: {
  group: ConversationMessagePartGroup;
  children: ReactNode;
}) {
  return (
    <InternalToolGroupRoot variant="ghost">
      <InternalToolGroupTrigger count={group.indices.length} active={group.status.type === "running"} />
      <InternalToolGroupContent>{children}</InternalToolGroupContent>
    </InternalToolGroupRoot>
  );
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

/** Stable facade for the upstream thread task summary. */
export function ConversationAgentStatus({
  className,
}: Readonly<{ className?: string }>) {
  return (
    <InternalTaskAgentStatus
      {...(className === undefined ? {} : { className })}
    />
  );
}

/** Stable facade for the upstream thread task tray. */
export function ConversationTaskTray({
  className,
}: Readonly<{ className?: string }>) {
  return (
    <InternalTaskTray {...(className === undefined ? {} : { className })} />
  );
}

/**
 * Product-neutral TaskGroup seam. The upstream TaskGroup implementation is
 * intentionally hidden behind this facade so Plugins never import vendor code.
 */
export function ConversationTaskGroup({
  group,
  className,
}: Readonly<{
  group: unknown;
  className?: string;
}>) {
  return (
    <InternalTaskGroup
      group={group as ComponentProps<typeof InternalTaskGroup>["group"]}
      {...(className === undefined ? {} : { className })}
    />
  );
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

export interface JobProgressStage {
  name: string;
  weight: number;
}

export interface JobProgressProps
  extends Omit<
    React.ComponentProps<"div">,
    "children" | "title" | "stages" | "stageIndex" | "stageProgress" | "eta" | "onCancel"
  > {
  title: string;
  stages: readonly JobProgressStage[];
  stageIndex: number;
  stageProgress: number;
  eta: string;
  onCancel?: (() => void) | undefined;
}

/** Stable facade for the official assistant-ui standalone JobProgress Element. */
export function JobProgress(props: Readonly<JobProgressProps>) {
  return <InternalJobProgress {...(props as ComponentProps<typeof InternalJobProgress>)} />;
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
    reloadCurrentThread: () => runtime.threads.reloadMainThread(),
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
  reloadCurrentThread(): Promise<void>;
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

/** Response APIs are separate from the existing message-scoped actions. */
export {
  CanonicalAssistantResponseFooter as ConversationCanonicalAssistantResponseFooter,
  ResponseActionBarRoot as ConversationResponseActionBarRoot,
  ResponseBranchPicker as ConversationResponseBranchPicker,
  CanonicalResponseCopyAction as ConversationCanonicalResponseCopyAction,
  CanonicalResponseReloadAction as ConversationCanonicalResponseReloadAction,
  CanonicalResponseExportMarkdownAction as ConversationCanonicalResponseExportMarkdownAction,
} from "./internal/composable-thread.js";
export {
  useAssistantResponseRuntime as useConversationResponseRuntime,
  type AssistantResponseRuntime as ConversationResponseRuntime,
} from "./internal/assistant-response-runtime.js";
export type {
  ConversationTurnGroup,
  // Existing public name is an alias to the same Turn type, with no separate grouping.
  ConversationTurnGroup as ConversationAssistantResponseGroup,
} from "./internal/conversation-turn.js";
