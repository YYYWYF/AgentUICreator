import { ConversationActionMoreMenu as InternalConversationActionMoreMenu, ConversationActionMoreMenuItem as InternalConversationActionMoreMenuItem } from "./internal/style-boundary/ConversationActionMoreMenu.js";
import { ComposerTextareaInput as InternalComposerTextareaInput } from "./internal/composer-input-host-context.js";
import type { AgentUITheme } from "./theme/theme-contract.js";
export { AGENT_UI_THEME_PRESETS, getAgentUIThemeColorScheme, isAgentUITheme } from "./theme/theme-contract.js";
export type { AgentUITheme, AgentUIColorScheme, AgentUIThemeConfig } from "./theme/theme-contract.js";
import { InternalConversationToolkitProvider } from "./internal/conversation-toolkit-provider.js";
import {
  ConversationOptionList as InternalConversationOptionList,
  ConversationQuestionFlow as InternalConversationQuestionFlow,
  useConversationCanAnswerToolCall as useInternalConversationCanAnswerToolCall,
} from "./internal/conversation-question-flow.js";
export interface ConversationOption {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
}
export interface ConversationOptionListProps {
  options: readonly ConversationOption[];
  selectionMode?: "single" | "multiple";
  defaultValue?: readonly string[];
  minSelections?: number;
  maxSelections?: number;
  onConfirm?: (ids: string[]) => void | Promise<void>;
  confirmLabel?: string;
}
export interface ConversationQuestionStep {
  id: string;
  question: string;
  description?: string;
  options: readonly ConversationOption[];
  selectionMode: "single" | "multiple";
  minSelections: number;
  maxSelections: number;
}
export interface ConversationQuestionFlowLabels {
  back: string;
  next: string;
  submit: string;
  submitting: string;
  answered: string;
  noneSelected: string;
}
export interface ConversationQuestionFlowProps {
  steps: readonly ConversationQuestionStep[];
  choice?: Readonly<Record<string, readonly string[]>> | undefined;
  onComplete?: ((answers: Record<string, string[]>) => void | Promise<void>) | undefined;
  labels: ConversationQuestionFlowLabels;
}
export function ConversationOptionList(props: ConversationOptionListProps): ReactElement {
  return <InternalConversationOptionList {...props} />;
}
export function ConversationQuestionFlow(props: ConversationQuestionFlowProps): ReactElement | null {
  return <InternalConversationQuestionFlow {...props} />;
}
export function useConversationCanAnswerToolCall(): boolean {
  return useInternalConversationCanAnswerToolCall();
}
import { AgentUIRoot as InternalAgentUIRoot, useAgentUIPortalContainer as useInternalAgentUIPortalContainer } from "./internal/style-boundary/AgentUIRoot.js";
import { AgentUIDialog as InternalAgentUIDialog } from "./internal/style-boundary/AgentUIDialog.js";
import { DialogContent as InternalAgentUIDialogContent } from "./internal/adapters/assistant-ui/components/ui/dialog.js";
import { Tooltip as InternalAgentUITooltip, TooltipTrigger as InternalAgentUITooltipTrigger, TooltipContent as InternalAgentUITooltipContent, TooltipProvider as InternalAgentUITooltipProvider } from "./internal/adapters/assistant-ui/components/ui/tooltip.js";
import { Popover as InternalAgentUIPopover, PopoverTrigger as InternalAgentUIPopoverTrigger, PopoverContent as InternalAgentUIPopoverContent } from "./internal/adapters/assistant-ui/components/ui/popover.js";
import type { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import type { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import type { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import {
  ConversationThreadListItemComposition,
} from "./internal/conversation-thread-list-item.js";
export interface ConversationThreadListItemActions {
  rename?: boolean;
  archive?: boolean;
  delete?: boolean;
}
export interface ConversationThreadListItemLabels {
  newChat: string;
  moreOptions: string;
  running: string;
  rename: string;
  archive: string;
  delete: string;
}
export interface ConversationThreadListItemProps {
  actions?: ConversationThreadListItemActions;
  labels?: ConversationThreadListItemLabels;
}
import {
  CanonicalComposer as InternalConversationCanonicalComposer,
  ComposerAddAttachmentAction as InternalConversationComposerAddAttachment,
  ComposerCancelAction as InternalConversationComposerCancel,
  ComposerDictateAction as InternalConversationComposerDictate,
  ComposerSendAction as InternalConversationComposerSend,
  ComposerStopDictationAction as InternalConversationComposerStopDictation,
  ComposableThread as InternalConversationThread,
  type ThreadComponents as InternalThreadComponents,
} from "./internal/composable-thread.js";
import { Sources as InternalSources } from "./internal/vendor/assistant-ui/components/assistant-ui/elements/sources.aui.js";
import { File as InternalFile } from "./internal/vendor/assistant-ui/components/assistant-ui/elements/file.js";
import { Image as InternalImage } from "./internal/adapters/assistant-ui/components/assistant-ui/elements/image.js";
import { ToolCall as InternalToolCall } from "./internal/vendor/assistant-ui/components/assistant-ui/elements/tool-call.js";
import { ToolFallback as InternalToolFallback } from "./internal/vendor/assistant-ui/components/assistant-ui/elements/tool-fallback.aui.js";
import { MarkdownText as InternalMarkdownText } from "./internal/adapters/assistant-ui/components/assistant-ui/elements/markdown-text.js";
import { Reasoning as InternalReasoning } from "./internal/adapters/assistant-ui/components/assistant-ui/elements/reasoning.aui.js";
import {
  ReasoningRoot as InternalReasoningRoot,
  ReasoningTrigger as InternalReasoningTrigger,
  ReasoningContent as InternalReasoningContent,
  ReasoningText as InternalReasoningText,
} from "./internal/adapters/assistant-ui/components/assistant-ui/elements/reasoning.aui.js";
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
} from "./internal/adapters/assistant-ui/components/assistant-ui/elements/tooltip-icon-button.js";
import { TooltipProvider as InternalTooltipProvider } from "./internal/adapters/assistant-ui/components/ui/tooltip.js";
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
} from "./internal/adapters/assistant-ui/components/assistant-ui/elements/agent-status.aui.js";
import { SubagentList as InternalSubagentList } from "./internal/vendor/assistant-ui/components/assistant-ui/elements/subagent-list.js";
import { JobProgress as InternalJobProgress } from "./internal/vendor/assistant-ui/components/assistant-ui/elements/job-progress.js";
import { ConversationTaskGroupComposition as InternalTaskGroup } from "./internal/conversation-task-group.js";
import { Badge as InternalBadge } from "./internal/vendor/assistant-ui/components/ui/badge.js";
import { Input as InternalInput } from "./internal/vendor/assistant-ui/components/ui/input.js";
import { Skeleton as InternalSkeleton } from "./internal/vendor/assistant-ui/components/ui/skeleton.js";
import type {
  ComponentProps,
  ComponentType,
  ReactElement,
  ReactNode,
} from "react";
export function AgentUIRoot({ theme, children }: { theme: AgentUITheme; children: ReactNode }): ReactElement {
  return <InternalAgentUIRoot theme={theme}>{children}</InternalAgentUIRoot>;
}
export function useAgentUIPortalContainer(): HTMLElement | null {
  return useInternalAgentUIPortalContainer() ?? null;
}
export const AgentUITooltip: ComponentType<TooltipPrimitive.Root.Props> = InternalAgentUITooltip;
export const AgentUITooltipTrigger: ComponentType<TooltipPrimitive.Trigger.Props> = InternalAgentUITooltipTrigger;
export const AgentUITooltipContent: ComponentType<TooltipPrimitive.Popup.Props & Pick<TooltipPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset">> = InternalAgentUITooltipContent;
export const AgentUITooltipProvider: ComponentType<TooltipPrimitive.Provider.Props> = InternalAgentUITooltipProvider;
export const AgentUIPopover: ComponentType<PopoverPrimitive.Root.Props> = InternalAgentUIPopover;
export const AgentUIPopoverTrigger: ComponentType<PopoverPrimitive.Trigger.Props> = InternalAgentUIPopoverTrigger;
export const AgentUIPopoverContent: ComponentType<PopoverPrimitive.Popup.Props & Pick<PopoverPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset">> = InternalAgentUIPopoverContent;
export const AgentUIDialog: Readonly<{
  Root: ComponentType<DialogPrimitive.Root.Props>;
  Trigger: ComponentType<DialogPrimitive.Trigger.Props>;
  Portal: ComponentType<Omit<DialogPrimitive.Portal.Props, "container">>;
  Backdrop: ComponentType<DialogPrimitive.Backdrop.Props>;
  Popup: ComponentType<DialogPrimitive.Popup.Props>;
  Title: ComponentType<DialogPrimitive.Title.Props>;
  Description: ComponentType<DialogPrimitive.Description.Props>;
  Close: ComponentType<DialogPrimitive.Close.Props>;
}> = InternalAgentUIDialog;
export const AgentUIDialogContent: ComponentType<DialogPrimitive.Popup.Props & { showCloseButton?: boolean }> = InternalAgentUIDialogContent;
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
import {
  DataMessageUIRegistration as InternalDataMessageUIRegistration,
  defineDataMessageUI as internalDefineDataMessageUI,
} from "./internal/data-message-ui.js";
export interface DataMessageUIRenderProps<TData = unknown> {
  data: TData;
}
export interface DataMessageUIDefinition<TData = unknown> {
  name: string;
  render: ComponentType<DataMessageUIRenderProps<TData>>;
}
export const defineDataMessageUI: <TData>(definition: DataMessageUIDefinition<TData>) => DataMessageUIDefinition<never> = internalDefineDataMessageUI;
export const DataMessageUIRegistration: ComponentType<{ definition: DataMessageUIDefinition<never> }> = InternalDataMessageUIRegistration;

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

export interface ConversationThreadLabels {
  generationStopped: string;
}

export interface ConversationThreadProps {
  components?: ConversationThreadComponents | undefined;
  /** Product integrations supply presentation copy through their locale layer. */
  labels?: ConversationThreadLabels | undefined;
  autoFocus?: boolean | undefined;
  composer?: ReactNode | null | undefined;
}

export function ConversationThread({
  components,
  labels,
  autoFocus,
  composer,
}: Readonly<ConversationThreadProps>) {
  return (
    <InternalConversationThread
      {...(components === undefined
        ? {}
        : { components: components as unknown as InternalThreadComponents })}
      {...(autoFocus === undefined ? {} : { autoFocus })}
      labels={labels}
      composer={composer}
    />
  );
}

export interface ConversationCanonicalComposerProps {
  autoFocus?: boolean | undefined;
  triggers?: ReactNode;
  beforeInput?: ReactNode;
  input?: ReactNode;
  leadingActions?: ReactNode;
  trailingActions?: ReactNode;
  submitAction?: ReactNode;
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

/** Canonical textarea fallback for optional Composer input Slots. */
export function ConversationComposerTextareaInput() {
  return <InternalComposerTextareaInput />;
}

export interface ConversationComposerAttachment {
  readonly id: string;
  readonly name: string;
}

/** State and actions for adapting a project-owned Composer view to the active Thread. */
export interface ConversationComposerController {
  readonly text: string;
  readonly attachments: readonly ConversationComposerAttachment[];
  readonly attachmentAccept: string;
  readonly attachmentsEnabled: boolean;
  readonly isRunning: boolean;
  readonly disabled: boolean;
  readonly canSend: boolean;
  readonly canCancel: boolean;
  setText(text: string): void;
  send(): void;
  cancel(): void;
  addAttachment(file: File): Promise<void>;
  removeAttachment(id: string): Promise<void>;
}

/** Connect a custom Composer UI to the existing assistant-ui Thread Composer. */
export function useConversationComposer(): ConversationComposerController {
  const runtime = useAui();
  const text = useInternalConversationState((state) => state.composer.text);
  const sourceAttachments = useInternalConversationState((state) => state.composer.attachments);
  const attachmentAccept = useInternalConversationState((state) => state.composer.attachmentAccept);
  const attachmentsEnabled = useInternalConversationState((state) => state.thread.capabilities.attachments);
  const isRunning = useInternalConversationState((state) => state.thread.isRunning);
  const disabled = useInternalConversationState((state) =>
    state.thread.isDisabled || state.composer.dictation?.inputDisabled === true,
  );
  const canSend = useInternalConversationState((state) =>
    state.composer.canSend && (!state.thread.isRunning || state.thread.capabilities.queue),
  );
  const canCancel = useInternalConversationState((state) => state.composer.canCancel);
  const attachments = useMemo(
    () => sourceAttachments.map(({ id, name }) => ({ id, name })),
    [sourceAttachments],
  );
  const actions = useMemo(() => ({
    setText: (value: string) => runtime.composer.setText(value),
    send: () => runtime.composer.send(),
    cancel: () => runtime.composer.cancel(),
    addAttachment: (file: File) => runtime.composer.addAttachment(file),
    removeAttachment: (id: string) => runtime.composer.attachment({ id }).remove(),
  }), [runtime]);
  return {
    text, attachments, attachmentAccept, attachmentsEnabled,
    isRunning, disabled, canSend, canCancel, ...actions,
  };
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

export type ConversationSuggestionTriggerProps = ComponentProps<"button"> & {
  asChild?: boolean;
  render?: ReactElement | undefined;
  send?: boolean | undefined;
  clearComposer?: boolean | undefined;
};

export function ConversationSuggestionTrigger(
  props: Readonly<ConversationSuggestionTriggerProps>,
) {
  return <SuggestionPrimitive.Trigger {...props} />;
}

export type ConversationSuggestionTitleProps = ComponentProps<"span"> & {
  asChild?: boolean;
  render?: ReactElement | undefined;
};

export function ConversationSuggestionTitle(
  props: Readonly<ConversationSuggestionTitleProps>,
) {
  return <SuggestionPrimitive.Title {...props} />;
}

export type ConversationSuggestionDescriptionProps = ConversationSuggestionTitleProps;

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
  addResult?: ((result: unknown) => void) | undefined;
  /** Preserve assistant-ui extension fields and callbacks at the facade seam. */
  readonly [key: string]: unknown;
}

export type ConversationToolCallComponent = ComponentType<ConversationToolCallProps>;

export interface ConversationToolkitEntry {
  type: "backend" | "human";
  display: "standalone";
  render: ComponentType<any>;
  description?: string | undefined;
  parameters?: Record<string, unknown> | undefined;
}

export type ConversationToolkit = Readonly<Record<string, ConversationToolkitEntry>>;

export function createConversationToolkit(
  toolkit: ConversationToolkit,
): ConversationToolkit {
  return defineToolkit(toolkit as never) as unknown as ConversationToolkit;
}

export interface ConversationToolkitProviderProps {
  toolkit: ConversationToolkit;
  children: ReactNode;
}

/** Extend the current Conversation Runtime with render-only toolkit entries. */
export function ConversationToolkitProvider({ toolkit, children }: ConversationToolkitProviderProps) {
  return <InternalConversationToolkitProvider toolkit={toolkit}>{children}</InternalConversationToolkitProvider>;
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

/** Product source presentation contract; not an AG-UI wire event. */
export type ConversationSourcePart =
  | { sourceType: "url"; id: string; url: string; title?: string }
  | { sourceType: "document"; id: string; title: string; mediaType: string; filename?: string };

/** Delegate source presentation to the official assistant-ui Sources element. */
export function ConversationSource(props: Readonly<ConversationSourcePart>) {
  return <InternalSources type="source" status={{ type: "complete" }} {...props} />;
}

export interface ConversationFileProps {
  filename?: string;
  data: string;
  mimeType: string;
  sourceType?: "url" | "id";
}

/** Official File presentation and download behavior behind the public facade. */
export function ConversationFile(props: Readonly<ConversationFileProps>) {
  return <InternalFile type="file" status={{ type: "complete" }} {...props} />;
}

export type ConversationTooltipIconButtonProps = import("@base-ui/react/button").Button.Props & {
  tooltip: string;
  side?: "top" | "bottom" | "left" | "right";
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link" | null | undefined;
  size?: "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg" | null | undefined;
};

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
  extends Omit<ComponentProps<"div">, "children"> {
  asChild?: boolean;
  render?: ReactElement | undefined;
  hideWhenSingleBranch?: boolean | undefined;
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
      <ErrorPrimitive.Root className="aui-message-error-root border-destructive bg-destructive/10 text-destructive dark:bg-destructive/5 mt-2 rounded-md border p-3 text-sm">
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

export function ConversationThreadListItem(props: ConversationThreadListItemProps = {}) {
  return <ConversationThreadListItemComposition {...props} />;
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
  title?: string | undefined;
  steps: readonly (string | ConversationAgentPlanStep)[];
  activeIndex: number;
}

export interface ConversationAgentPlanStep {
  id?: string | undefined;
  label: string;
  description?: string | undefined;
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
 * Product-owned transcript seam around the unchanged upstream TaskCard shell.
 * Plugins consume canonical nested messages through this facade.
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
      components={taskTranscriptComponents}
      {...(className === undefined ? {} : { className })}
    />
  );
}

const taskTranscriptComponents = {
  Text: ConversationMarkdownText,
  Reasoning: ConversationReasoning,
  Error: ConversationCanonicalMessageError,
};

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
  description?: string | undefined;
}

export interface ConversationJobOutcome {
  status: "success" | "partial" | "failed" | "cancelled";
  summary?: string | undefined;
}

/** @deprecated Use the product-owned ConversationJobOutcome name. */
export type ConversationJobProgressOutcome = ConversationJobOutcome;

export interface JobProgressProps
  extends Omit<
    React.ComponentProps<"div">,
    "children" | "title" | "stages" | "stageIndex" | "stageProgress" | "eta" | "onCancel" | "outcome" | "elapsedMs"
  > {
  title: string;
  stages: readonly JobProgressStage[];
  stageIndex: number;
  stageProgress: number;
  eta?: string | undefined;
  onCancel?: (() => void) | undefined;
  outcome?: ConversationJobOutcome | undefined;
  elapsedMs?: number | undefined;
}

/** Stable facade for the official assistant-ui standalone JobProgress Element. */
export function JobProgress(props: Readonly<JobProgressProps>) {
  const { eta = "", ...facadeProps } = props;
  return (
    <InternalJobProgress
      {...(facadeProps as ComponentProps<typeof InternalJobProgress>)}
      eta={eta}
    />
  );
}

export function useConversationNavigation(): ConversationNavigation {
  const runtime = useAui();
  return {
    switchToThread: (threadId) => Promise.resolve(runtime.threads.switchToThread(threadId)),
    switchToNewThread: () => Promise.resolve(runtime.threads.switchToNewThread()),
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
import {
  CanonicalAssistantResponseFooter,
  ResponseActionBarRoot,
  ResponseBranchPicker,
  CanonicalResponseCopyAction,
  CanonicalResponseReloadAction,
  CanonicalResponseExportMarkdownAction,
} from "./internal/composable-thread.js";
import { useAssistantResponseRuntime } from "./internal/assistant-response-runtime.js";
export const ConversationCanonicalAssistantResponseFooter: ComponentType = CanonicalAssistantResponseFooter;
export const ConversationResponseActionBarRoot: ComponentType<{ children?: ReactNode }> = ResponseActionBarRoot;
export const ConversationResponseBranchPicker: ComponentType = ResponseBranchPicker;
export const ConversationCanonicalResponseCopyAction: ComponentType = CanonicalResponseCopyAction;
export const ConversationCanonicalResponseReloadAction: ComponentType = CanonicalResponseReloadAction;
export const ConversationCanonicalResponseExportMarkdownAction: ComponentType = CanonicalResponseExportMarkdownAction;
export interface ConversationTurnGroup {
  turnId: string;
  requestMessageId: string | null;
  assistantMessageIds: readonly string[];
  headAssistantMessageId: string;
  tailAssistantMessageId: string;
  headAssistantIndex: number;
  tailAssistantIndex: number;
}
export type ConversationAssistantResponseGroup = ConversationTurnGroup;
export interface ConversationResponseRuntime {
  group: ConversationTurnGroup;
  text: string;
  isRunning: boolean;
  canReload: boolean;
  canSwitchBranch: boolean;
  branchNumber: number;
  branchCount: number;
  reload(): void;
  switchToPreviousBranch(): void;
  switchToNextBranch(): void;
}
export const useConversationResponseRuntime: () => ConversationResponseRuntime = useAssistantResponseRuntime;

import {
  InternalConversationQuoteBlock,
  InternalConversationComposerQuotePreview,
  InternalConversationQuoteSelectionToolbar,
  useInternalConversationQuoteLifecycle,
} from "./internal/conversation-quote.js";
export function ConversationQuoteBlock(props: { text: string; messageId: string }): ReactElement {
  return <InternalConversationQuoteBlock {...props} />;
}
export function ConversationComposerQuotePreview(props: { dismissLabel: string }): ReactElement {
  return <InternalConversationComposerQuotePreview {...props} />;
}
export function ConversationQuoteSelectionToolbar(props: { quoteLabel: string }): ReactElement | null {
  return <InternalConversationQuoteSelectionToolbar {...props} />;
}
export function useConversationQuoteLifecycle(): void {
  useInternalConversationQuoteLifecycle();
}

export interface ConversationMentionItem {
  id: string;
  type: string;
  label: string;
  description?: string;
}
export interface ConversationMentionSource {
  /** Change when identity, locale, permissions, or available data changes. */
  cacheKey: string | number;
  /** Notify cacheKey changes when the source object stays mounted. */
  subscribe?(listener: () => void): () => void;
  search(input: { query: string; signal: AbortSignal }): Promise<readonly ConversationMentionItem[]>;
}
export interface ConversationCommandBase {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
}
export type ConversationSlashCommand =
  | (ConversationCommandBase & { mode: "action"; execute(): void | Promise<void> })
  | (ConversationCommandBase & { mode: "directive" });
export interface ConversationSlashCommandSource {
  getSnapshot(): readonly ConversationSlashCommand[];
  subscribe(listener: () => void): () => void;
}
export interface ConversationTriggerLabels {
  suggestions: string;
  back: string;
  empty: string;
  loading: string;
  searchFailed: string;
  retry: string;
  commandFailed: string;
  invalidItem: string;
}
export interface ConversationMentionTriggerProps {
  source?: ConversationMentionSource | undefined;
  labels: ConversationTriggerLabels;
  debounceMs?: number | undefined;
}
export interface ConversationCommandTriggerProps {
  source?: ConversationSlashCommandSource | undefined;
  labels: ConversationTriggerLabels;
}
import { InternalConversationMentionTrigger, InternalConversationCommandTrigger } from "./internal/conversation-composer-triggers.js";
export function ConversationComposerMentionTrigger(props: ConversationMentionTriggerProps): ReactElement | null {
  return <InternalConversationMentionTrigger {...props} />;
}
export function ConversationComposerCommandTrigger(props: ConversationCommandTriggerProps): ReactElement | null {
  return <InternalConversationCommandTrigger {...props} />;
}

export { WebSearch, RetrievalChunks, type WebSearchResult, type WebSearchProps, type RetrievalChunk, type RetrievalChunksProps } from "./internal/search-elements.js";

import { NativeSelect as InternalNativeSelect, NativeSelectOption as InternalNativeSelectOption } from "./internal/primitives/native-select.js";

/** Official shadcn native select; native menus stay within the browser. */
export function NativeSelect(props: Omit<React.ComponentProps<"select">, "size"> & { size?: "sm" | "default" }) {
  return <InternalNativeSelect {...props} />;
}
export function NativeSelectOption(props: React.ComponentProps<"option">) {
  return <InternalNativeSelectOption {...props} />;
}

/** The existing response Footer owns menu placement and localized menu content. */
export function ConversationActionMoreMenu(props: { label: string; children: ReactNode }): ReactElement {
  return <InternalConversationActionMoreMenu {...props} />;
}

export function ConversationActionMoreMenuItem(props: {
  children: ReactNode; disabled?: boolean; onSelect?: (event: Event) => void;
}): ReactElement {
  return <InternalConversationActionMoreMenuItem {...props} />;
}
