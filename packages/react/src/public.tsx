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
  MessagePartPrimitive,
  MessagePrimitive,
  SuggestionPrimitive,
  ThreadListPrimitive as InternalConversationThreadListPrimitive,
  ThreadPrimitive,
  defineToolkit,
  groupPartByType,
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
  ReactElement,
  ReactNode,
} from "react";
import { useMemo, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  Loader2Icon,
  RefreshCwIcon,
} from "lucide-react";
import { cn } from "./internal/vendor/assistant-ui/lib/utils.js";

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
  Welcome?: ComponentType | undefined;
  ToolFallback?: ComponentType<ConversationToolCallProps> | undefined;
  ToolGroup?: ComponentType<{ children?: ReactNode; group: unknown }> | undefined;
  ReasoningGroup?: ComponentType<{ children?: ReactNode; group: unknown }> | undefined;
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

export interface ConversationSubagentRenderScope {
  readonly tool: ConversationToolCallProps;
}

/** The footer keeps its scope intentionally data-free; actions read Message Context. */
export type ConversationAssistantMessageFooterRenderScope = Record<string, never>;

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

function ConversationMessageError() {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="aui-message-error-root border-destructive bg-destructive/10 text-destructive dark:bg-destructive/5 mt-2 rounded-md border p-3 text-sm dark:text-red-200">
        <ErrorPrimitive.Message className="aui-message-error-message line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
}

export interface ConversationCanonicalAssistantMessageProps {
  reasoningGroup?: ComponentType<{
    children?: ReactNode;
    group: unknown;
  }> | undefined;
  toolGroup?: ComponentType<{
    children?: ReactNode;
    group: unknown;
  }> | undefined;
  toolFallback?: ConversationToolCallComponent | undefined;
  footer?: ReactNode;
}

/**
 * The upstream AssistantMessage composition with a product-owned Footer seam.
 * Message parts, grouping, errors, and named Tool UI priority stay canonical.
 */
export function ConversationCanonicalAssistantMessage({
  reasoningGroup,
  toolGroup,
  toolFallback,
  footer,
}: Readonly<ConversationCanonicalAssistantMessageProps>) {
  const ToolFallbackComponent = toolFallback ?? ConversationToolFallback;

  return (
    <MessagePrimitive.Root
      data-slot="aui_assistant-message-root"
      data-role="assistant"
      className="fade-in slide-in-from-bottom-1 animate-in relative -mb-7.5 pb-7.5 duration-150 [contain-intrinsic-size:auto_200px] [content-visibility:auto]"
    >
      <div
        data-slot="aui_assistant-message-content"
        className="text-foreground px-2 leading-relaxed wrap-break-word"
      >
        <MessagePrimitive.GroupedParts
          groupBy={groupPartByType({
            reasoning: ["group-chainOfThought", "group-reasoning"],
            "tool-call": ["group-chainOfThought", "group-tool"],
            "standalone-tool-call": [],
          })}
        >
          {({ part, children }) => {
            switch (part.type) {
              case "group-chainOfThought":
                return <div data-slot="aui_chain-of-thought">{children}</div>;
              case "group-tool":
                if (toolGroup !== undefined) {
                  const ToolGroupComponent = toolGroup;
                  return (
                    <ToolGroupComponent group={part}>{children}</ToolGroupComponent>
                  );
                }
                return (
                  <InternalToolGroupRoot variant="ghost">
                    <InternalToolGroupTrigger
                      count={part.indices.length}
                      active={part.status.type === "running"}
                    />
                    <InternalToolGroupContent>{children}</InternalToolGroupContent>
                  </InternalToolGroupRoot>
                );
              case "group-reasoning":
                if (reasoningGroup !== undefined) {
                  const ReasoningGroupComponent = reasoningGroup;
                  return (
                    <ReasoningGroupComponent group={part}>
                      {children}
                    </ReasoningGroupComponent>
                  );
                }
                return (
                  <InternalReasoningRoot streaming={part.status.type === "running"}>
                    <InternalReasoningTrigger active={part.status.type === "running"} />
                    <InternalReasoningContent aria-busy={part.status.type === "running"}>
                      <InternalReasoningText>{children}</InternalReasoningText>
                    </InternalReasoningContent>
                  </InternalReasoningRoot>
                );
              case "text":
                return <InternalMarkdownText />;
              case "reasoning":
                return <InternalReasoning {...part} />;
              case "tool-call":
                return part.toolUI ?? <ToolFallbackComponent {...part} />;
              case "data":
                return part.dataRendererUI;
              case "file":
                return (
                  <div data-slot="aui_assistant-message-file" className="py-1">
                    <InternalFile {...part} />
                  </div>
                );
              case "image":
                return (
                  <div data-slot="aui_assistant-message-image" className="py-1">
                    <InternalImage {...part} />
                  </div>
                );
              case "indicator":
                return (
                  <span
                    data-slot="aui_assistant-message-indicator"
                    className="animate-pulse font-sans"
                    aria-label="Assistant is working"
                  >
                    {"●"}
                  </span>
                );
              default:
                return null;
            }
          }}
        </MessagePrimitive.GroupedParts>
        <ConversationMessageError />
      </div>

      {footer === undefined || footer === null ? null : (
        <div
          data-slot="aui_assistant-message-footer"
          className="ms-2 flex min-h-7.5 items-center pt-1.5"
        >
          {footer}
        </div>
      )}
    </MessagePrimitive.Root>
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
    <InternalReasoningRoot streaming={running}>
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
          data-slot="subagent-conversation-message"
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

function shouldUseConversationToolFallback(
  props: ConversationToolCallProps,
): boolean {
  return props.isError === true ||
    props.status.type === "requires-action" ||
    props.status.type === "incomplete";
}

/**
 * Generic presentation for a tool call whose canonical conversation part
 * contains nested messages. The runtime decides whether the part has
 * messages; this facade only owns the reusable tool shell and nested view.
 */
export function ConversationSubagentTool(
  props: Readonly<ConversationToolCallProps>,
) {
  const [open, setOpen] = useState(true);
  if (shouldUseConversationToolFallback(props)) {
    return <ConversationToolFallback {...props} />;
  }

  const running = props.status.type === "running";
  return (
    <InternalCollapsible
      data-slot="subagent-conversation-root"
      data-status={props.status.type}
      open={open}
      onOpenChange={setOpen}
      className="my-2 w-full max-w-xl"
    >
      <InternalCollapsibleTrigger
        data-slot="subagent-conversation-trigger"
        className="text-foreground/70 hover:text-foreground flex w-full items-center gap-2 py-1.5 text-sm transition-colors outline-none"
      >
        <ChevronRightIcon
          data-slot="subagent-conversation-chevron"
          aria-hidden="true"
          className={[
            "size-3.5 shrink-0 transition-transform duration-200",
            "motion-reduce:transition-none",
            open ? "rotate-90" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        />
        <span className="font-medium">{props.toolName}</span>
        <span
          data-slot="subagent-conversation-status"
          className="ms-auto flex size-4 shrink-0 items-center justify-center"
          aria-hidden="true"
        >
          {running ? (
            <Loader2Icon className="size-3.5 animate-spin motion-reduce:animate-none" />
          ) : (
            <CheckIcon className="size-3.5 text-emerald-500" />
          )}
        </span>
      </InternalCollapsibleTrigger>

      <InternalCollapsibleContent
        data-slot="subagent-conversation-content"
        aria-label={props.toolName}
        className="ms-5 mt-1 min-w-0 pb-1 outline-none"
      >
        <ConversationSubagentMessages />
      </InternalCollapsibleContent>
    </InternalCollapsible>
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
