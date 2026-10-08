"use client";

import { useAgentUILocale, DEFAULT_AGENT_UI_MESSAGES } from "../locale.js";
import { ComposerInputHostContext, ComposerTextareaInput } from "./composer-input-host-context.js";

import { ConversationUserDirectiveText } from "./conversation-directive-text.js";
import { ConversationActionMoreMenuItem } from "./style-boundary/ConversationActionMoreMenu.js";
import { QuoteThreadRootContext } from "./quote-thread-root.js";
import { QuoteSelectableText } from "./quote-selectable-text.js";
import { InternalConversationQuoteBlock } from "./conversation-quote.js";
import {
  ComposerAddAttachment as UpstreamComposerAddAttachment,
  ComposerAttachments,
  UserMessageAttachments,
} from "./adapters/assistant-ui/components/assistant-ui/elements/attachment.aui.js";
import { Sources } from "./vendor/assistant-ui/components/assistant-ui/elements/sources.aui.js";
import { File } from "./adapters/assistant-ui/components/assistant-ui/elements/file.js";
import { ThreadFollowupSuggestions } from "./vendor/assistant-ui/components/assistant-ui/elements/follow-up-suggestions.aui.js";
import { Image } from "./adapters/assistant-ui/components/assistant-ui/elements/image.js";
import {
  Reasoning,
  ReasoningContent,
  ReasoningRoot,
  ReasoningText,
  ReasoningTrigger,
} from "./adapters/assistant-ui/components/assistant-ui/elements/reasoning.aui.js";
import { ToolFallback } from "./adapters/assistant-ui/components/assistant-ui/elements/tool-fallback.aui.js";
import { isTaskPart } from "./adapters/assistant-ui/components/assistant-ui/elements/task-card.aui.js";
import {
  ToolGroupContent,
  ToolGroupRoot,
  ToolGroupTrigger,
} from "./adapters/assistant-ui/components/assistant-ui/elements/tool-group.aui.js";
import { TooltipIconButton } from "./adapters/assistant-ui/components/assistant-ui/elements/tooltip-icon-button.js";
import { Button } from "./vendor/assistant-ui/components/ui/button.js";
import { Skeleton } from "./vendor/assistant-ui/components/ui/skeleton.js";
import { cn } from "./vendor/assistant-ui/lib/utils.js";
import {
  ActionBarPrimitive,
  AuiIf,
  type AssistantState,
  BranchPickerPrimitive,
  ComposerPrimitive,
  QueueItemPrimitive,
  ErrorPrimitive,
  groupPartByType,
  MessagePrimitive,
  SuggestionPrimitive,
  ThreadPrimitive,
  type FileMessagePartComponent,
  type ImageMessagePartComponent,
  type ToolCallMessagePartComponent,
  useAuiState,
} from "@assistant-ui/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  MicIcon,
  PlusIcon,
  PencilIcon,
  RefreshCwIcon,
  SquareIcon,
  ThumbsUpIcon,
  ThumbsDownIcon,
  XIcon,
} from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type FC,
  type PropsWithChildren,
  type ReactNode,
} from "react";

import { projectToolTimeline } from "./tool-timeline-projection.js";

import { resolveConversationTurnGroup } from "./conversation-turn.js";
import { AssistantResponseRuntimeProvider, useAssistantResponseRuntime } from "./assistant-response-runtime.js";

export type ThreadGroupPart = MessagePrimitive.GroupedParts.GroupPart;

/**
 * Optional component overrides for the thread. `AssistantMessage` and
 * `Welcome` replace whole sections; the remaining slots override assistant
 * message groups, tool calls, or its footer. Tool UIs registered by name
 * (toolkit `render`, `useAssistantDataUI`) take precedence over
 * `ToolFallback`.
 */
export type ThreadComponents = {
  UserEditComposer?: ComponentType | undefined;
  AssistantMessage?: ComponentType | undefined;
  AssistantResponseFooter?: ComponentType | undefined;
  /** @deprecated Use AssistantResponseFooter. */
  AssistantMessageFooter?: ComponentType | undefined;
  Welcome?: ComponentType | undefined;
  ToolFallback?: ToolCallMessagePartComponent | undefined;
  ThinkingIndicator?: ComponentType<{ reasoningVisible: boolean; timelineVisible: boolean }> | undefined;
  reasoningVisible?: boolean | undefined;
  ToolTimeline?: ComponentType<PropsWithChildren> | undefined;
  ToolGroup?:
    | ComponentType<PropsWithChildren<{ group: ThreadGroupPart }>>
    | undefined;
  ReasoningGroup?:
    | ComponentType<PropsWithChildren<{ group: ThreadGroupPart }>>
    | undefined;
  TaskGroup?:
    | ComponentType<PropsWithChildren<{ group: ThreadGroupPart }>>
    | undefined;
};

const messageGroupBy = groupPartByType({
  reasoning: ["group-chainOfThought", "group-reasoning"],
  "tool-call": ["group-chainOfThought", "group-tool"],
  "standalone-tool-call": [],
});

type ThreadGroupKey =
  | "group-chainOfThought"
  | "group-reasoning"
  | "group-tool"
  | "group-task";

const TASK_GROUP_PATH: readonly ThreadGroupKey[] = [
  "group-chainOfThought",
  "group-task",
];

const taskAwareGroupBy = (
  part: Parameters<typeof messageGroupBy>[0],
  context?: Parameters<typeof messageGroupBy>[1],
): readonly ThreadGroupKey[] => {
  const path = messageGroupBy(part, context);
  return part.type === "tool-call" &&
      isTaskPart(part) &&
      path.length > 0 &&
      !context?.toolUIs?.[part.toolName]?.length
    ? TASK_GROUP_PATH
    : path;
};

export type ThreadProps = {
  components?: ThreadComponents | undefined;
  labels?: { generationStopped: string; editCancel?: string; editUpdate?: string; editInput?: string } | undefined;
  autoFocus?: boolean | undefined;
  /** Product-owned composition seam; null means the host intentionally has no Composer. */
  composer?: ReactNode | null | undefined;
};

const EMPTY_COMPONENTS: ThreadComponents = {};

const ThreadComponentsContext =
  createContext<ThreadComponents>(EMPTY_COMPONENTS);

const DEFAULT_THREAD_LABELS = { generationStopped: DEFAULT_AGENT_UI_MESSAGES.conversation.generationStopped, editCancel: DEFAULT_AGENT_UI_MESSAGES.common.cancel, editUpdate: DEFAULT_AGENT_UI_MESSAGES.common.update, editInput: DEFAULT_AGENT_UI_MESSAGES.conversation.editInput };
const ThreadLabelsContext = createContext(DEFAULT_THREAD_LABELS);

interface ComposerHostConfig {
  autoFocus: boolean;
}

const ComposerHostConfigContext = createContext<ComposerHostConfig>({
  autoFocus: false,
});

// Startup exposes a loading placeholder thread; treat it as a new chat so
// the composer mounts centered. Loads after startup keep the docked layout.
const isNewChatView = (s: AssistantState) =>
  s.thread.messages.length === 0 &&
  (!s.thread.isLoading || s.threads.isLoading);

// A switched thread that is still fetching its history: skeleton, not welcome.
const isHistoryLoadingView = (s: AssistantState) =>
  s.thread.messages.length === 0 &&
  s.thread.isLoading &&
  !s.thread.isDisabled &&
  !s.threads.isLoading;

const ThreadHistorySkeleton: FC = () => {
  const localeMessages = useAgentUILocale();
  return (
  <div
    data-slot="aui_thread-history-skeleton"
    role="status"
    className="animate-in fade-in fill-mode-both flex flex-col gap-y-6 [animation-delay:150ms] [animation-duration:200ms]"
  >
    <span className="sr-only">{localeMessages.conversation.loading}</span>
    <Skeleton className="ml-auto h-9 w-2/5 rounded-xl motion-reduce:animate-none" />
    <div className="flex flex-col gap-y-2">
      <Skeleton className="h-4 w-11/12 motion-reduce:animate-none" />
      <Skeleton className="h-4 w-4/5 motion-reduce:animate-none" />
      <Skeleton className="h-4 w-3/5 motion-reduce:animate-none" />
    </div>
    <Skeleton className="ml-auto h-9 w-1/3 rounded-xl motion-reduce:animate-none" />
    <div className="flex flex-col gap-y-2">
      <Skeleton className="h-4 w-10/12 motion-reduce:animate-none" />
      <Skeleton className="h-4 w-2/3 motion-reduce:animate-none" />
    </div>
  </div>
);
};

export const ComposableThread: FC<ThreadProps> = ({
  components = EMPTY_COMPONENTS,
  labels,
  autoFocus = true,
  composer = null,
}) => {
  const localeMessages = useAgentUILocale();
  const defaultLabels = { generationStopped: localeMessages.conversation.generationStopped, editCancel: localeMessages.common.cancel, editUpdate: localeMessages.common.update, editInput: localeMessages.conversation.editInput };
  const isEmpty = useAuiState(isNewChatView);

  return (
    <ThreadComponentsContext.Provider value={components}>
      <ThreadLabelsContext.Provider value={{ ...defaultLabels, ...labels }}>
        <ComposerHostConfigContext.Provider value={{ autoFocus }}>
          <ThreadRoot isEmpty={isEmpty} composer={composer} />
        </ComposerHostConfigContext.Provider>
      </ThreadLabelsContext.Provider>
    </ThreadComponentsContext.Provider>
  );
};

const ThreadRoot: FC<{
  isEmpty: boolean;
  composer: ReactNode | null;
}> = ({
  isEmpty,
  composer,
}) => {
  const quoteRootRef = useRef<HTMLDivElement | null>(null);
  const { Welcome = ThreadWelcome } = useContext(ThreadComponentsContext);

  return (
    <QuoteThreadRootContext.Provider value={quoteRootRef}>
    <ThreadPrimitive.Root
      ref={quoteRootRef}
      className="aui-root aui-thread-root bg-background @container flex h-full flex-col"
      style={{
        ["--thread-max-width" as string]: "44rem",
        ["--composer-bg" as string]: "var(--color-card)",
        ["--composer-radius" as string]: "1.5rem",
        ["--composer-padding" as string]: "8px",
      }}
    >
      <ThreadPrimitive.Viewport
        turnAnchor="bottom"
        data-slot="aui_thread-viewport"
        className="relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll scroll-smooth"
      >
        <div
          data-slot="agent-ui-thread-content"
          className={cn(
            "mx-auto flex w-full max-w-(--thread-max-width) flex-1 flex-col px-4 pt-4",
            isEmpty && "justify-center",
          )}
        >
          <AuiIf condition={isNewChatView}>
            <Welcome />
          </AuiIf>
          <AuiIf condition={isHistoryLoadingView}>
            <ThreadHistorySkeleton />
          </AuiIf>

          <div
            data-slot="aui_message-group"
            className="mb-14 flex flex-col gap-y-6 empty:hidden"
          >
            <ThreadPrimitive.Messages>
              {() => <ThreadMessage />}
            </ThreadPrimitive.Messages>
          </div>

          <ThreadPrimitive.ViewportFooter
            className={cn(
              "aui-thread-viewport-footer bg-background flex flex-col gap-4 overflow-visible pb-4 md:pb-6",
              !isEmpty &&
                "sticky bottom-0 mt-auto rounded-t-(--composer-radius)",
            )}
          >
            <ThreadScrollToBottom />
            <ThreadFollowupSuggestions />
            {composer}
            <AuiIf condition={(s) => isNewChatView(s) && s.composer.isEmpty}>
              <ThreadSuggestions />
            </AuiIf>
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
    </QuoteThreadRootContext.Provider>
  );
};

const ThreadMessage: FC = () => {
  const { AssistantMessage: AssistantMessageComponent = AssistantMessage, UserEditComposer = CanonicalUserEditComposer } =
    useContext(ThreadComponentsContext);
  const role = useAuiState((s) => s.message.role);
  const isEditing = useAuiState((s) => s.message.composer.isEditing);

  if (role === "system") return null;
  if (isEditing) return <UserEditComposer />;
  if (role === "user") return <UserMessage />;
  return <AssistantMessageComponent />;
};

const ThreadScrollToBottom: FC = () => {
  const localeMessages = useAgentUILocale();
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip={localeMessages.conversation.scrollToBottom}
        variant="outline"
        className="aui-thread-scroll-to-bottom dark:border-border dark:bg-background dark:hover:bg-accent absolute -top-12 z-10 self-center rounded-full p-4 disabled:invisible"
      >
        <ArrowDownIcon />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const ThreadWelcome: FC = () => {
  const localeMessages = useAgentUILocale();
  return (
    <div className="aui-thread-welcome-root mb-6 flex flex-col items-center px-4 text-center">
      <h1 className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-2xl font-medium tracking-tight duration-200">

        {localeMessages.conversation.welcome}
      </h1>
    </div>
  );
};

const ThreadSuggestions: FC = () => {
  return (
    <div className="aui-thread-welcome-suggestions flex w-full flex-wrap items-center justify-center gap-2 px-4">
      <ThreadPrimitive.Suggestions>
        {() => <ThreadSuggestionItem />}
      </ThreadPrimitive.Suggestions>
    </div>
  );
};

const ThreadSuggestionItem: FC = () => {
  return (
    <div className="aui-thread-welcome-suggestion-display fade-in slide-in-from-bottom-2 animate-in fill-mode-both duration-200">
      <SuggestionPrimitive.Trigger send asChild>
        <Button
          variant="ghost"
          className="aui-thread-welcome-suggestion text-foreground hover:bg-muted border-border/60 h-auto gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-normal whitespace-nowrap transition-colors"
        >
          <SuggestionPrimitive.Title className="aui-thread-welcome-suggestion-text-1" />
          <SuggestionPrimitive.Description className="aui-thread-welcome-suggestion-text-2 empty:hidden" />
        </Button>
      </SuggestionPrimitive.Trigger>
    </div>
  );
};

export interface ComposerQueueLabels {
  queued: string;
  removeQueued: string;
}

export const ComposerQueue: FC<ComposerQueueLabels> = ({ queued, removeQueued }) => (
  <AuiIf condition={(s) => s.thread.capabilities.queue && s.composer.queue.length > 0}>
    <div data-slot="aui_composer-queue" className="border-primary/20 bg-primary/5 flex flex-col gap-1 rounded-lg border p-2">
      <span className="text-muted-foreground text-xs">{queued}</span>
      <ComposerPrimitive.Queue>
        {() => (
          <div data-slot="aui_composer-queue-item" className="flex items-center gap-2 rounded-md bg-background/60 px-2 py-1 text-sm">
            <div className="min-w-0 flex-1 break-words"><QueueItemPrimitive.Text /></div>
            <QueueItemPrimitive.Remove asChild>
              <TooltipIconButton tooltip={removeQueued} aria-label={removeQueued} type="button" className="size-6 shrink-0">
                <XIcon className="size-3.5" />
              </TooltipIconButton>
            </QueueItemPrimitive.Remove>
          </div>
        )}
      </ComposerPrimitive.Queue>
    </div>
  </AuiIf>
);

export interface CanonicalComposerProps {
  autoFocus?: boolean | undefined;
  placeholder: string;
  inputAriaLabel: string;
  queueLabels: ComposerQueueLabels;
  triggers?: ReactNode;
  beforeInput?: ReactNode;
  input?: ReactNode;
  leadingActions?: ReactNode;
  trailingActions?: ReactNode;
  submitAction?: ReactNode;
}

export const CanonicalComposer: FC<CanonicalComposerProps> = ({
  autoFocus,
  placeholder,
  inputAriaLabel,
  queueLabels,
  triggers,
  beforeInput,
  input,
  leadingActions,
  trailingActions,
  submitAction,
}) => {
  const inheritedHostConfig = useContext(ComposerHostConfigContext);
  const resolvedAutoFocus = autoFocus ?? inheritedHostConfig.autoFocus;

  return (
    <ComposerPrimitive.Unstable_TriggerPopoverRoot>
    <ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col">
      {triggers}
      <ComposerPrimitive.AttachmentDropzone asChild>
        <div
          data-slot="aui_composer-shell"
          className="border-border/60 data-[dragging=true]:border-ring focus-within:border-border dark:border-muted-foreground/15 dark:focus-within:border-muted-foreground/30 flex w-full cursor-text flex-col gap-2 rounded-(--composer-radius) border bg-(--composer-bg) p-(--composer-padding) transition-[border-color] data-[dragging=true]:border-dashed data-[dragging=true]:bg-[color-mix(in_oklab,var(--color-accent)_50%,var(--color-background))]"
        >
          <ComposerAttachments />
          {beforeInput === undefined || beforeInput === null ? null : (
            <div data-slot="aui_composer-before-input">{beforeInput}</div>
          )}
          <ComposerQueue {...queueLabels} />
          <ComposerInputHostContext.Provider value={{ variant: "primary", placeholder, inputAriaLabel, autoFocus: resolvedAutoFocus }}>
            {input ?? <ComposerTextareaInput />}
          </ComposerInputHostContext.Provider>
          <div className="aui-composer-action-wrapper relative flex items-center justify-between">
            <div
              data-slot="aui_composer-leading-actions"
              className="flex items-center gap-1.5"
            >
              {leadingActions}
            </div>
            <div
              data-slot="aui_composer-trailing-actions"
              className="flex items-center gap-1.5"
            >
              {trailingActions}
              {submitAction}
            </div>
          </div>
        </div>
      </ComposerPrimitive.AttachmentDropzone>
    </ComposerPrimitive.Root>
    </ComposerPrimitive.Unstable_TriggerPopoverRoot>
  );
};

const ComposerAddAttachmentOverride: FC<{ label: string }> = ({ label }) => {
  return (
    <ComposerPrimitive.AddAttachment
      render={
        <TooltipIconButton
          tooltip={label}
          side="bottom"
          variant="ghost"
          size="icon"
          className="aui-composer-add-attachment text-muted-foreground hover:text-foreground hover:bg-muted-foreground/15 dark:border-muted-foreground/15 dark:hover:bg-muted-foreground/30 size-7 rounded-full active:scale-[0.96] motion-reduce:transition-none"
          aria-label={label}
        />
      }
    >
      <PlusIcon className="aui-attachment-add-icon size-4" />
    </ComposerPrimitive.AddAttachment>
  );
};

export const ComposerAddAttachmentAction: FC<{ label?: string }> = ({ label }) => {
  if (label === undefined) {
    return <UpstreamComposerAddAttachment />;
  }

  return <ComposerAddAttachmentOverride label={label} />;
};

interface ComposerDictateActionProps {
  tooltip: string;
  ariaLabel: string;
}

export const ComposerDictateAction: FC<ComposerDictateActionProps> = ({
  tooltip,
  ariaLabel,
}) => (
  <AuiIf condition={(s) => s.thread.capabilities.dictation && s.composer.dictation == null}>
    <ComposerPrimitive.Dictate asChild>
      <TooltipIconButton
        tooltip={tooltip}
        side="bottom"
        type="button"
        variant="ghost"
        size="icon"
        className="aui-composer-dictate text-muted-foreground hover:text-foreground size-7 rounded-full"
        aria-label={ariaLabel}
      >
        <MicIcon className="aui-composer-dictate-icon size-4" />
      </TooltipIconButton>
    </ComposerPrimitive.Dictate>
  </AuiIf>
);

interface ComposerStopDictationActionProps {
  tooltip: string;
  ariaLabel: string;
}

export const ComposerStopDictationAction: FC<ComposerStopDictationActionProps> = ({
  tooltip,
  ariaLabel,
}) => (
  <AuiIf condition={(s) => s.thread.capabilities.dictation && s.composer.dictation != null}>
    <ComposerPrimitive.StopDictation asChild>
      <TooltipIconButton
        tooltip={tooltip}
        side="bottom"
        type="button"
        variant="ghost"
        size="icon"
        className="aui-composer-stop-dictation text-destructive size-7 rounded-full"
        aria-label={ariaLabel}
      >
        <SquareIcon className="aui-composer-stop-dictation-icon size-3.5 animate-pulse fill-current" />
      </TooltipIconButton>
    </ComposerPrimitive.StopDictation>
  </AuiIf>
);

export const ComposerSendAction: FC<{ label: string; queueLabel: string }> = ({ label, queueLabel }) => {
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const actionLabel = isRunning ? queueLabel : label;
  return (
    <AuiIf condition={(s) => !s.thread.isRunning || s.thread.capabilities.queue}>
      <ComposerPrimitive.Send asChild>
        <TooltipIconButton
          tooltip={actionLabel}
          side="bottom"
          type="button"
          variant="default"
          size="icon"
          className="aui-composer-send size-7 rounded-full"
          aria-label={actionLabel}
        >
          <ArrowUpIcon className="aui-composer-send-icon size-4" />
        </TooltipIconButton>
      </ComposerPrimitive.Send>
    </AuiIf>
  );
};

export const ComposerCancelAction: FC<{ label: string }> = ({ label }) => (
  <AuiIf condition={(s) => s.thread.isRunning}>
    <ComposerPrimitive.Cancel asChild>
      <Button
        type="button"
        variant="default"
        size="icon"
        className="aui-composer-cancel size-7 rounded-full"
        aria-label={label}
      >
        <SquareIcon className="aui-composer-cancel-icon size-3.5 fill-current" />
      </Button>
    </ComposerPrimitive.Cancel>
  </AuiIf>
);

const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="aui-message-error-root border-destructive bg-destructive/10 text-destructive dark:bg-destructive/5 mt-2 rounded-md border p-3 text-sm">
        <ErrorPrimitive.Message className="aui-message-error-message line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

const AssistantResponseFooterHost: FC<{
  FooterComponent?: ComponentType | undefined;
}> = ({ FooterComponent }) => {
  const messages = useAuiState((s) => s.thread.messages);
  const messageIndex = useAuiState((s) => s.message.index);
  const turn = resolveConversationTurnGroup(messages, messages[messageIndex]?.id ?? "");
  if (!turn || turn.tailAssistantMessageId !== messages[messageIndex]?.id) return null;

  // Product layout policy: reserve the semantic footer's full height in flow.
  // Plugin footers can vary in height, so cancelling a fixed action-bar height
  // would let the next message overlap them. Keep this policy on the host.
  return (
    <AssistantResponseRuntimeProvider key={turn.turnId} group={turn}>
      <div
        data-slot="aui_assistant-response-footer"
        className={cn("ms-2 flex items-center", "min-h-7.5 pt-1.5")}
      >
        {FooterComponent ? (
          <FooterComponent />
        ) : (
          <CanonicalAssistantResponseFooter />
        )}
      </div>
    </AssistantResponseRuntimeProvider>
  );
};

const AssistantMessage: FC = () => {
  const localeMessages = useAgentUILocale();
  const {
    ToolFallback: ToolFallbackComponent = ToolFallback,
    ToolGroup,
    ToolTimeline,
    ThinkingIndicator,
    reasoningVisible = true,
    ReasoningGroup,
    TaskGroup: TaskGroupComponent,
    AssistantResponseFooter,
    AssistantMessageFooter,
  } = useContext(ThreadComponentsContext);
  const AssistantResponseFooterComponent = AssistantResponseFooter ?? AssistantMessageFooter;
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const labels = useContext(ThreadLabelsContext);
  // Presentation only: response actions and persistence still read real content.
  const showCancelledEmptyFallback = useAuiState((s) =>
    s.message.status?.type === "incomplete" &&
    s.message.status.reason === "cancelled" &&
    s.message.content.length === 0,
  );
  const parts = useAuiState(s => s.message.parts);
  const toolUIs = useAuiState(s => s.tools.toolUIs);
  const timeline = projectToolTimeline(parts, toolUIs);
  const baseGroupBy = TaskGroupComponent ? taskAwareGroupBy : messageGroupBy;
  const groupBy = ToolTimeline ? (part: Parameters<typeof messageGroupBy>[0], context?: Parameters<typeof messageGroupBy>[1]) => {
    // Ordinary summarized tools and protected actions stay in their chronological
    // position. Protected tools must never sit inside a collapsed ToolGroup.
    if (part.type === "tool-call" && timeline.calls.some(call => call.toolCallId === part.toolCallId && (call.summarized || call.protected))) return [];
    return baseGroupBy(part, context);
  } : baseGroupBy;

  return (
    <MessagePrimitive.Root
      data-slot="aui_assistant-message-root"
      data-role="assistant"
      data-aui-quote-selectable="false"
      className="fade-in slide-in-from-bottom-1 animate-in relative duration-150"
    >
      <div
        data-slot="aui_assistant-message-content"
        className="text-foreground px-2 leading-relaxed wrap-break-word"
      >
        {showCancelledEmptyFallback ? (
          <div
            data-slot="aui_assistant-message-cancelled"
            className="text-muted-foreground"
          >
            {labels.generationStopped}
          </div>
        ) : (
          <div data-slot="aui_assistant-message-parts">
            {ThinkingIndicator ? <ThinkingIndicator reasoningVisible={reasoningVisible} timelineVisible={!!ToolTimeline} /> : null}
            <MessagePrimitive.GroupedParts groupBy={groupBy}>
              {({ part, children }) => {
                switch (part.type) {
                  case "group-chainOfThought":
                    return (
                      <div
                        data-slot="aui_chain-of-thought"
                      >
                        {children}
                      </div>
                    );
                  case "group-task":
                    return TaskGroupComponent ? (
                      <TaskGroupComponent group={part}>{children}</TaskGroupComponent>
                    ) : children;
                  case "group-tool":
                    if (ToolGroup) {
                      return <ToolGroup group={part}>{children}</ToolGroup>;
                    }
                    return (
                      <ToolGroupRoot variant="ghost"
                        data-agent-state={part.status.type === "running" ? "running" : "idle"}>
                        <ToolGroupTrigger
                          count={part.indices.length}
                          active={part.status.type === "running"}
                        />
                        <ToolGroupContent>{children}</ToolGroupContent>
                      </ToolGroupRoot>
                    );
                  case "group-reasoning": {
                    if (ThinkingIndicator && (!reasoningVisible || !part.indices.some(index => parts[index]?.type === "reasoning" && parts[index].text))) return null;
                    if (ReasoningGroup) {
                      return (
                        <ReasoningGroup group={part}>{children}</ReasoningGroup>
                      );
                    }
                    const running = part.status.type === "running";
                    return (
                      <ReasoningRoot className="mb-0" streaming={running}>
                        <ReasoningTrigger active={running} />
                        <ReasoningContent aria-busy={running}>
                          <ReasoningText>{children}</ReasoningText>
                        </ReasoningContent>
                      </ReasoningRoot>
                    );
                  }
                  case "text":
                    return <QuoteSelectableText />;
                  case "reasoning":
                    if (ThinkingIndicator && (!reasoningVisible || !part.text)) return null;
                    return <Reasoning {...part} />;
                  case "tool-call": {
                    const call = timeline.calls.find(call => call.toolCallId === part.toolCallId);
                    if (ToolTimeline && call?.summarized) {
                      const anchor = call.toolCallId === timeline.anchorId;
                      return <>
                        {anchor ? <ToolTimeline>
                          {timeline.detailIndices.map(index => <MessagePrimitive.PartByIndex key={parts[index]?.type === "tool-call" ? parts[index].toolCallId : index} index={index}
                            components={{ tools: { Fallback: ToolFallbackComponent } }} />)}
                        </ToolTimeline> : null}
                        {call.protected ? part.toolUI ?? <ToolFallbackComponent {...part} /> : null}
                      </>;
                    }
                    return part.toolUI ?? <ToolFallbackComponent {...part} />;
                  }
                  case "source":
                    return <Sources {...part} />;
                  case "data":
                    return part.dataRendererUI;
                  case "file":
                    return (
                      <div data-slot="aui_assistant-message-file" className="py-1">
                        <File {...part} />
                      </div>
                    );
                  case "image":
                    return (
                      <div data-slot="aui_assistant-message-image" className="py-1">
                        <Image {...part} />
                      </div>
                    );
                  case "indicator":
                    if (ThinkingIndicator) return null;
                    return (
                      <span
                        data-slot="aui_assistant-message-indicator"
                        className="animate-pulse font-sans"
                        aria-label={localeMessages.conversation.working}
                      >
                        {"●"}
                      </span>
                    );
                  default:
                    return null;
                }
              }}
            </MessagePrimitive.GroupedParts>
          </div>
        )}
        <MessageError />
      </div>

      {!isRunning ? (
        <AssistantResponseFooterHost FooterComponent={AssistantResponseFooterComponent} />
      ) : null}
    </MessagePrimitive.Root>
  );
};

export const ResponseActionBarRoot: FC<PropsWithChildren> = ({ children }) => (
  <ActionBarPrimitive.Root
    hideWhenRunning
    autohide="not-last"
    className="aui-assistant-action-bar-root text-muted-foreground animate-in fade-in col-start-3 row-start-2 -ms-1 flex gap-1 duration-200"
  >
    {children}
  </ActionBarPrimitive.Root>
);

export const CanonicalResponseCopyAction: FC = () => {
  const localeMessages = useAgentUILocale();
  const response = useAssistantResponseRuntime();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const generation = useRef(0);
  useEffect(() => {
    setCopied(false);
    generation.current++;
    return () => {
      generation.current++;
      clearTimeout(timer.current);
    };
  }, [response.group.headAssistantMessageId, response.text]);
  const disabled = response.isRunning || !response.text;
  return (
    <TooltipIconButton
      tooltip={localeMessages.common.copy}
      type="button"
      disabled={disabled}
      {...(copied ? { "data-copied": "true" } : {})}
      onClick={async () => {
        if (disabled) return;
        const current = generation.current;
        try {
          await navigator.clipboard.writeText(response.text);
          if (current !== generation.current) return;
          clearTimeout(timer.current);
          setCopied(true);
          timer.current = setTimeout(() => setCopied(false), 3000);
        } catch (error) {
          console.error("[agent-ui] response copy failed:", error);
        }
      }}
    >
      {copied ? (
        <CheckIcon data-slot="assistant-ui-copy-action-copied" className="animate-in zoom-in-50 fade-in duration-200 ease-out" />
      ) : (
        <CopyIcon data-slot="assistant-ui-copy-action-idle" className="animate-in zoom-in-75 fade-in duration-150" />
      )}
    </TooltipIconButton>
  );
};

export const CanonicalResponseFeedbackActions: FC<{ helpful: string; notHelpful: string }> = ({ helpful, notHelpful }) => (
  <AuiIf condition={(s) => s.thread.capabilities.feedback}>
    <ActionBarPrimitive.FeedbackPositive asChild>
      <TooltipIconButton tooltip={helpful} aria-label={helpful} type="button" className="data-[submitted]:text-primary">
        <ThumbsUpIcon />
      </TooltipIconButton>
    </ActionBarPrimitive.FeedbackPositive>
    <ActionBarPrimitive.FeedbackNegative asChild>
      <TooltipIconButton tooltip={notHelpful} aria-label={notHelpful} type="button" className="data-[submitted]:text-primary">
        <ThumbsDownIcon />
      </TooltipIconButton>
    </ActionBarPrimitive.FeedbackNegative>
  </AuiIf>
);

export const CanonicalResponseReloadAction: FC = () => {
  const localeMessages = useAgentUILocale();
  const response = useAssistantResponseRuntime();
  return (
    <TooltipIconButton tooltip={localeMessages.common.refresh} type="button" disabled={!response.canReload} onClick={response.reload}>
      <RefreshCwIcon />
    </TooltipIconButton>
  );
};

export const CanonicalResponseExportMarkdownAction: FC<{ menuLabel?: string }> = ({ menuLabel }) => {
  const localeMessages = useAgentUILocale();
  const response = useAssistantResponseRuntime();
  const disabled = response.isRunning || !response.text;
  const exportMarkdown = () => {
    if (disabled) return;
    const blob = new Blob([response.text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `response-${Date.now()}.md`;
      anchor.click();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 40_000);
    }
  };
  if (menuLabel !== undefined) {
    return <ConversationActionMoreMenuItem disabled={disabled} onSelect={exportMarkdown}>
      <DownloadIcon className="size-4" />{menuLabel}
    </ConversationActionMoreMenuItem>;
  }
  return <TooltipIconButton tooltip={localeMessages.conversation.exportMarkdown} type="button" disabled={disabled} onClick={exportMarkdown}>
    <DownloadIcon />
  </TooltipIconButton>;
};

export const ResponseBranchPicker: FC = () => {
  const localeMessages = useAgentUILocale();
  const response = useAssistantResponseRuntime();
  if (response.branchCount <= 1 || !response.canSwitchBranch) return null;
  return (
    <div className="aui-branch-picker-root text-muted-foreground -ms-2 me-2 inline-flex items-center text-xs">
      <TooltipIconButton tooltip={localeMessages.common.previous} type="button" disabled={response.branchNumber <= 1} onClick={response.switchToPreviousBranch}>
        <ChevronLeftIcon />
      </TooltipIconButton>
      <span className="aui-branch-picker-state font-medium">{response.branchNumber} / {response.branchCount}</span>
      <TooltipIconButton tooltip={localeMessages.common.next} type="button" disabled={response.branchNumber >= response.branchCount} onClick={response.switchToNextBranch}>
        <ChevronRightIcon />
      </TooltipIconButton>
    </div>
  );
};

export const CanonicalAssistantResponseFooter: FC = () => (
  <><ResponseBranchPicker /><AssistantActionBar /></>
);

const AssistantActionBar: FC = () => (
  <ResponseActionBarRoot>
    <CanonicalResponseCopyAction />
    <CanonicalResponseReloadAction />
    <CanonicalResponseExportMarkdownAction />
  </ResponseActionBarRoot>
);

const UserFilePart: FileMessagePartComponent = (part) => (
  <div data-slot="aui_user-message-file" className="py-1">
    <File {...part} />
  </div>
);

const UserImagePart: ImageMessagePartComponent = (part) => (
  <div data-slot="aui_user-message-image" className="py-1">
    <Image {...part} />
  </div>
);

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      data-slot="aui_user-message-root"
      className="fade-in slide-in-from-bottom-1 animate-in grid auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 duration-150 [contain-intrinsic-size:auto_200px] [content-visibility:auto] [&:where(>*)]:col-start-2"
      data-role="user"
      data-aui-quote-selectable="false"
    >
      <UserMessageAttachments />
      <MessagePrimitive.Quote>{quote => <InternalConversationQuoteBlock text={quote.text} messageId={quote.messageId} />}</MessagePrimitive.Quote>

      <div className="aui-user-message-content-wrapper relative col-start-2 min-w-0">
        <div data-slot="aui_user-message-content" className="aui-user-message-content peer bg-muted text-foreground rounded-xl px-4 py-2 wrap-break-word empty:hidden">
          <MessagePrimitive.Parts
            components={{ Text: ConversationUserDirectiveText, File: UserFilePart, Image: UserImagePart }}
          />
        </div>
        <div className="aui-user-action-bar-wrapper absolute start-0 top-1/2 -translate-x-full -translate-y-1/2 pe-2 peer-empty:hidden rtl:translate-x-full">
          <UserActionBar />
        </div>
      </div>

      <BranchPicker
        data-slot="aui_user-branch-picker"
        className="col-span-full col-start-1 row-start-3 -me-1 justify-end"
      />
    </MessagePrimitive.Root>
  );
};

const UserActionBar: FC = () => {
  const localeMessages = useAgentUILocale();
  const isDisabled = useAuiState(s => s.thread.isDisabled);
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-user-action-bar-root flex flex-col items-end"
    >
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton tooltip={localeMessages.common.edit} disabled={isDisabled} className="aui-user-action-edit">
          <PencilIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
};

export const CanonicalUserEditComposer: FC<{ input?: ReactNode }> = ({ input }) => {
  const labels = useContext(ThreadLabelsContext);
  return (
    <MessagePrimitive.Root
      data-slot="aui_edit-composer-wrapper"
      className="flex flex-col px-2 [contain-intrinsic-size:auto_200px] [content-visibility:auto]"
    >
      <ComposerPrimitive.Unstable_TriggerPopoverRoot>
      <ComposerPrimitive.Root data-slot="agent-ui-edit-composer" className="aui-edit-composer-root border-foreground/10 focus-within:border-foreground/25 transition-[border-color] ms-auto flex w-full max-w-[85%] cursor-text flex-col rounded-(--composer-radius) border bg-(--composer-bg)">
        <ComposerInputHostContext.Provider value={{ variant: "message-edit", placeholder: labels.editInput, inputAriaLabel: labels.editInput, autoFocus: true }}>
          {input ?? <ComposerTextareaInput />}
        </ComposerInputHostContext.Provider>
        <div className="aui-edit-composer-footer mx-2.5 mb-2.5 flex items-center gap-1.5 self-end">
          <ComposerPrimitive.Cancel asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-full px-3.5"
            >
              {labels.editCancel}
            </Button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <Button size="sm" className="h-8 rounded-full px-3.5">
              {labels.editUpdate}
            </Button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
      </ComposerPrimitive.Unstable_TriggerPopoverRoot>
    </MessagePrimitive.Root>
  );
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({
  className,
  ...rest
}) => {
  const localeMessages = useAgentUILocale();
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
        <TooltipIconButton tooltip={localeMessages.common.previous}>
          <ChevronLeftIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="aui-branch-picker-state font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip={localeMessages.common.next}>
          <ChevronRightIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};
