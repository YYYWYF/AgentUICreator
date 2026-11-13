/** Shared runtime/context and primitive seams for source-owned UI plugins.
 * Presentation implementations themselves live in each Plugin directory.
 */
export { useAgentUILocale } from "./locale.js";
export { useConversationCommandDecision } from "./internal/conversation-command-decisions.js";
export { useAssistantResponseRuntime } from "./internal/assistant-response-runtime.js";
export { TooltipIconButton } from "./internal/adapters-generated/assistant-ui/components/assistant-ui/elements/tooltip-icon-button.js";
export { ConversationActionMoreMenuItem } from "./internal/style-boundary/ConversationActionMoreMenu.js";
export { AuiIf, ActionBarPrimitive } from "@assistant-ui/react";
export { CheckIcon, CopyIcon, RefreshCwIcon, DownloadIcon, ThumbsUpIcon, ThumbsDownIcon } from "lucide-react";
export { ReasoningRoot, ReasoningTrigger, ReasoningContent, ReasoningText } from "./internal/adapters-generated/assistant-ui/components/assistant-ui/elements/reasoning.aui.js";
export { ToolGroupRoot, ToolGroupTrigger, ToolGroupContent } from "./internal/adapters-generated/assistant-ui/components/assistant-ui/elements/tool-group.aui.js";

export { ComposerPrimitive, ComposerPrimitive as ComposerActions, useAuiState, ThreadPrimitive as ConversationParts, SuggestionPrimitive as SuggestionActions } from "@assistant-ui/react";
export { ArrowUpIcon, SquareIcon, MicIcon, PlusIcon, HistoryIcon, SquarePenIcon, BotIcon, ChevronsUpDownIcon, LogOutIcon, UserRoundIcon, FileTextIcon, FileSearchIcon, PenLineIcon, TerminalIcon, SearchIcon, WrenchIcon } from "lucide-react";
export { Button } from "./internal/adapters-generated/assistant-ui/components/ui/button.js";
export { useConversationComposerSendGuard } from "./internal/conversation-composer-guard.js";
export { useOptionalAgentUI } from "@za38.03/agent-ui-runtime/plugin-api";
export { ResponseActionBarRoot, ResponseBranchPicker } from "./internal/composable-thread.js";
export { ToolTimeline } from "./internal/adapters-generated/assistant-ui/components/assistant-ui/elements/tool-timeline.js";
export { ThinkingIndicator } from "./internal/adapters-generated/assistant-ui/components/assistant-ui/elements/thinking-indicator.js";
export { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./internal/adapters-generated/assistant-ui/components/ui/collapsible.js";
export { projectToolTimeline, timelineToolKind, hasPendingToolAction, type TimelineCall, type TimelinePart } from "./internal/tool-timeline-projection.js";
export { formatPresentationMessage } from "./locale.js";

export { DEFAULT_AGENT_UI_MESSAGES, type AgentUILocaleMessages } from "./locale.js";
export { toolApprovalAcceptsText, useScrollLock, useToolCallElapsed, type ToolApprovalAnswer, type ToolApprovalOption, type ToolApprovalQuestion, type ToolCallMessagePart, type ToolCallMessagePartProps, type ToolCallMessagePartStatus, type ToolCallMessagePartComponent } from "@assistant-ui/react";
export { cn } from "./internal/vendor-generated/assistant-ui/lib/utils.js";
export { CollapsibleRoot as FallbackDisclosure, CollapsibleContent as FallbackDisclosureContent, CollapsibleTrigger as FallbackDisclosureTrigger } from "./internal/vendor-generated/assistant-ui/components/assistant-ui/elements/collapsible-root.js";
export { Textarea } from "./internal/vendor-generated/assistant-ui/components/ui/textarea.js";
export { useTransientMessages } from "./internal/conversation-transient-messages.js";
export { resolveTransientMessageAnchor } from "./conversation-transient-message-service.js";
export { AlertCircleIcon, ChevronDownIcon, CircleMinusIcon, LoaderIcon, XCircleIcon } from "lucide-react";

export { Image } from "./internal/adapters-generated/assistant-ui/components/assistant-ui/elements/image.js";
export { File } from "./internal/adapters-generated/assistant-ui/components/assistant-ui/elements/file.js";
export { useAgentUIThemeSnapshot } from "./plugin-api/useAgentUIThemeSnapshot.js";
export { useAgentUILocaleSnapshot } from "./plugin-api/useAgentUILocaleSnapshot.js";

/** Internal pure helpers receive already-resolved copy from the question Plugin. */
export { ConversationOptionList as QuestionOptionList, ConversationQuestionFlow as QuestionFlow } from "./internal/conversation-question-flow.js";

// Source-owned presentation uses the same Host/runtime instances as npm UI.
// These are behavior seams; their Providers and stores are never extracted.
export { useThreadRootElementRef } from "./internal/quote-thread-root.js";
export { SelectionToolbarPrimitive } from "./internal/quote-selection-adapter.js";
export { TaskDisclosureScopeContext, useTaskDisclosure } from "./internal/task-disclosure-context.js";
export { useConversationToolRenderer } from "./internal/tool-renderer-context.js";
export { resolveConversationTurnGroup } from "./internal/conversation-turn.js";
export { deleteThreadWithSelectionRecovery } from "./internal/thread-delete-recovery.js";
export { agentUIDirectiveFormatter, hasUnsupportedConversationDirective, conversationDirectiveDisplayLabel } from "./internal/directive-formatter.js";
export { detectTrigger, type TriggerMatch } from "./internal/trigger-matcher.js";
export { serializeConversationDirective } from "./internal/composer-trigger-utils.js";
export type { ConversationMentionTriggerProps, ConversationCommandTriggerProps } from "./internal/composer-trigger-types.js";
