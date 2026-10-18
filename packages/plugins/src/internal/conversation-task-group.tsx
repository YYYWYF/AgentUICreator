"use client";

import { useAgentUILocale, formatPresentationMessage } from "../locale.js";
import {
  MessagePrimitive,
  ReadonlyThreadProvider,
  ThreadPrimitive,
  useAui,
  useAuiState,
  type TextMessagePartComponent,
  type ReasoningMessagePartComponent,
  type ToolCallMessagePartComponent,
} from "@assistant-ui/react";
import equal from "fast-deep-equal/es6/index.js";
import { createContext, useContext, useState, useRef, type ComponentType } from "react";
import { TaskCard as TaskCardShell } from "./adapters-generated/assistant-ui/components/assistant-ui/elements/task-card.js";
import { isTaskPart, type TaskPart } from "./adapters-generated/assistant-ui/components/assistant-ui/elements/task-card.aui.js";
import {
  ToolFallback, ToolFallbackApproval, ToolFallbackError,
  formatUnknownValue, offersInterruptAction,
} from "./adapters-generated/assistant-ui/components/assistant-ui/elements/tool-fallback.aui.js";
import {
  TASK_PAGE_SIZE, formatElapsed, taskLabel, taskMeta, taskStateOf, useTaskElapsed,
} from "./vendor-generated/assistant-ui/components/assistant-ui/utils/task.js";
import { cn } from "./vendor-generated/assistant-ui/lib/utils.js";
import { mono } from "./vendor-generated/assistant-ui/components/assistant-ui/elements/surfaces.js";
import { resolveConversationTurnGroup } from "./conversation-turn.js";
import { TaskDisclosureScopeContext, useTaskDisclosure } from "./task-disclosure-context.js";

type TranscriptComponents = {
  Text: TextMessagePartComponent;
  Reasoning: ReasoningMessagePartComponent;
  Error: ComponentType;
};
const TranscriptContext = createContext<TranscriptComponents | null>(null);
const roleLabels = { user: "instruction", assistant: "agent", system: "system" } as const;

/**
 * Product composition for the pinned TaskCard's missing transcript seam.
 * Keep the upstream shell, state helpers and approval UI. Only canonical nested
 * messages are consumed here; AG-UI attribution remains owned by react-ag-ui.
 * Remove this composition when upstream offers a transcript override that can
 * pass the positive incremental acceptance tests.
 */
const NestedTool: ToolCallMessagePartComponent = ({ approval, interrupt, ...rest }) => {
  // A nested transcript is readonly, just as in upstream TaskCard: requests are
  // answered in their live run. Never expose approval/interrupt actions here.
  const part = rest.status.type === "requires-action"
    ? { ...rest, status: { type: "requires-action", reason: "interrupt" } as const }
    : rest;
  return isTaskPart(part) ? <TaskCardComposition part={part} /> : <ToolFallback {...part} />;
};

function NestedMessage() {
  const components = useContext(TranscriptContext)!;
  const role = useAuiState((s) => s.message.role);
  const messageId = useAuiState((s) => s.message.id);
  const parentScope = useContext(TaskDisclosureScopeContext);
  return (
    <TaskDisclosureScopeContext.Provider value={[...parentScope, messageId]}>
      <MessagePrimitive.Root
        data-slot="aui_task-transcript-message"
        data-role={role}
        className="flex flex-col gap-1 text-xs leading-relaxed"
      >
        <span data-agent-ui-owned="" className={cn(mono, "text-foreground/35")}>{roleLabels[role]}</span>
        <MessagePrimitive.Parts components={{
          Text: components.Text,
          Reasoning: components.Reasoning,
          tools: { Fallback: NestedTool },
        }} />
        <components.Error />
      </MessagePrimitive.Root>
    </TaskDisclosureScopeContext.Provider>
  );
}

function TaskCardComposition({ part }: { part: TaskPart }) {
  const labels = useAgentUILocale("tasks");
  // Upstream can recreate equivalent nested snapshots on parent notifications.
  // Keep the readonly provider input stable to avoid a notification/render loop;
  // changed content, status and metadata still flow through immediately.
  const messagesRef = useRef(part.messages);
  if (!equal(messagesRef.current, part.messages)) messagesRef.current = part.messages;

  const childFailed = part.messages?.some(message => message.role === "assistant" &&
    message.status.type === "incomplete" && message.status.reason === "error") === true;
  const disclosure = useTaskDisclosure(part.toolCallId);
  const elapsed = useTaskElapsed(part.timing,
    part.status.type === "running" || part.status.type === "requires-action");
  const showError = part.status.type === "incomplete" && part.status.error != null;
  const approvalPending = part.approval == null ||
    (part.approval.approved === undefined && part.approval.resolution === undefined);
  const actions = part.status.type === "requires-action" && approvalPending &&
    offersInterruptAction(part.status, part.approval, part.interrupt)
    ? <ToolFallbackApproval
        status={part.status}
        {...(part.approval !== undefined && { approval: part.approval })}
        {...(part.interrupt !== undefined && { interrupt: part.interrupt })}
        {...(part.addResult && { addResult: part.addResult })}
        {...(part.resume && { resume: part.resume })}
        {...(part.respondToApproval && { respondToApproval: part.respondToApproval })}
      />
    : undefined;
  const result = showError || childFailed || part.result !== undefined ? <>
    {childFailed && <p data-agent-ui-owned="" data-slot="agent-ui-task-child-error" role="status" className="m-0 text-destructive">{labels.childFailed}</p>}
    {showError && <ToolFallbackError status={part.status} />}
    {part.result !== undefined && (typeof part.result === "string"
      ? <p data-agent-ui-owned="" className="m-0 whitespace-pre-wrap">{part.result}</p>
      : <pre data-agent-ui-owned="" className="m-0 overflow-x-auto whitespace-pre-wrap">{formatUnknownValue(part.result, 2)}</pre>)}
  </> : undefined;
  return (
    <TaskCardShell
      label={taskLabel(part.toolName, part.args)}
      meta={taskMeta(part.args)}
      state={taskStateOf(part.status, part.isError)}
      elapsed={elapsed === undefined ? undefined : formatElapsed(elapsed)}
      actions={actions}
      result={result}
      open={disclosure.open}
      onOpenChange={disclosure.onOpenChange}
    >
      {part.messages?.length ? (
        <TaskDisclosureScopeContext.Provider value={disclosure.scope}>
          <ReadonlyThreadProvider messages={messagesRef.current!}>
            <ThreadPrimitive.Messages>{() => <NestedMessage />}</ThreadPrimitive.Messages>
          </ReadonlyThreadProvider>
        </TaskDisclosureScopeContext.Provider>
      ) : undefined}
    </TaskCardShell>
  );
}

function TaskLane({ index }: { index: number }) {
  const aui = useAui();
  const part = useAuiState((s) => s.message.parts[index]);
  if (part?.type !== "tool-call") return null;
  const client = aui.message.part({ toolCallId: part.toolCallId });
  return <TaskCardComposition part={{ ...part,
    addResult: client.addToolResult,
    resume: client.resumeToolCall,
    respondToApproval: client.respondToToolApproval,
  }} />;
}

function TaskLanes({ group, className }: {
  group: MessagePrimitive.GroupedParts.GroupPart;
  className?: string;
}) {
  const localeMessages = useAgentUILocale();
  const [visible, setVisible] = useState(TASK_PAGE_SIZE);
  const { indices, counts } = group;
  // Grouping and run counts come from assistant-ui, never from a product store.
  const keys = useAuiState((s) => JSON.stringify(indices.map((index) => {
    const part = s.message.parts[index];
    return part?.type === "tool-call" ? part.toolCallId : index;
  }))) as string;
  const laneKeys = JSON.parse(keys) as (string | number)[];
  const failed = useAuiState((s) => indices.filter((index) => {
    const part = s.message.parts[index];
    return part?.type === "tool-call" && taskStateOf(part.status, part.isError) === "failed";
  }).length);
  if (indices.length === 1) return <TaskLane index={indices[0]!} />;
  const hidden = indices.length - Math.min(visible, indices.length);
  // Localize only presentation; counts and lane identities remain upstream-owned.
  const summary = [
    formatPresentationMessage(localeMessages.tasks.groupCount, { count: indices.length }),
    counts.running > 0 && formatPresentationMessage(localeMessages.tasks.groupRunning, { count: counts.running }),
    counts.requiresAction > 0 && formatPresentationMessage(localeMessages.tasks.groupWaiting, { count: counts.requiresAction }),
    failed > 0 && formatPresentationMessage(localeMessages.tasks.groupFailed, { count: failed }),
  ].filter(Boolean).join(" · ");
  return (
    <div data-agent-ui-owned="" data-slot="aui_task-group" className={cn("flex w-full max-w-sm flex-col gap-2", className)}>
      <div data-agent-ui-owned="" data-slot="aui_task-group-summary" className="text-muted-foreground px-1 text-xs">{summary}</div>
      {indices.slice(0, visible).map((index, position) => <TaskLane key={laneKeys[position] ?? index} index={index} />)}
      {hidden > 0 && <button data-agent-ui-owned=""
        type="button" data-slot="aui_task-group-more"
        onClick={() => setVisible((count) => count + TASK_PAGE_SIZE)}
        className="text-muted-foreground hover:text-foreground w-fit px-1 text-xs transition-colors"
      >{localeMessages.common.show} {Math.min(hidden, TASK_PAGE_SIZE)}  {localeMessages.common.more}</button>}
    </div>
  );
}

export function ConversationTaskGroupComposition({ components, ...props }: {
  group: MessagePrimitive.GroupedParts.GroupPart;
  className?: string;
  components: TranscriptComponents;
}) {
  // Request + creation time distinguishes reused tool IDs and regenerated branches;
  // neither changes when an optimistic assistant message receives its final ID.
  const scope = useAuiState(s => JSON.stringify([
    resolveConversationTurnGroup(s.thread.messages, s.message.id)?.requestMessageId ?? null,
    s.message.createdAt.getTime(),
  ]));
  return <TaskDisclosureScopeContext.Provider value={[scope]}>
    <TranscriptContext.Provider value={components}><TaskLanes {...props} /></TranscriptContext.Provider>
  </TaskDisclosureScopeContext.Provider>;
}
