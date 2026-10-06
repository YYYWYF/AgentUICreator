"use client";

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
import { createContext, useContext, useState, type ComponentType } from "react";
import { TaskCard as TaskCardShell } from "./vendor/assistant-ui/components/assistant-ui/elements/task-card.js";
import { isTaskPart, type TaskPart } from "./adapters/assistant-ui/components/assistant-ui/elements/task-card.aui.js";
import {
  ToolFallback, ToolFallbackApproval, ToolFallbackError,
  formatUnknownValue, offersInterruptAction,
} from "./vendor/assistant-ui/components/assistant-ui/elements/tool-fallback.aui.js";
import {
  TASK_PAGE_SIZE, formatElapsed, taskLabel, taskMeta, taskStateOf, useTaskElapsed,
} from "./vendor/assistant-ui/components/assistant-ui/utils/task.js";
import { cn } from "./vendor/assistant-ui/lib/utils.js";
import { mono } from "./vendor/assistant-ui/components/assistant-ui/elements/surfaces.js";

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
  return (
    <MessagePrimitive.Root
      data-slot="aui_task-transcript-message"
      data-role={role}
      className="flex flex-col gap-1 text-xs leading-relaxed"
    >
      <span className={cn(mono, "text-foreground/35")}>{roleLabels[role]}</span>
      <MessagePrimitive.Parts components={{
        Text: components.Text,
        Reasoning: components.Reasoning,
        tools: { Fallback: NestedTool },
      }} />
      <components.Error />
    </MessagePrimitive.Root>
  );
}

function TaskCardComposition({ part }: { part: TaskPart }) {
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
  const result = showError || part.result !== undefined ? <>
    {showError && <ToolFallbackError status={part.status} />}
    {part.result !== undefined && (typeof part.result === "string"
      ? <p className="m-0 whitespace-pre-wrap">{part.result}</p>
      : <pre className="m-0 overflow-x-auto whitespace-pre-wrap">{formatUnknownValue(part.result, 2)}</pre>)}
  </> : undefined;
  return (
    <TaskCardShell
      label={taskLabel(part.toolName, part.args)}
      meta={taskMeta(part.args)}
      state={taskStateOf(part.status, part.isError)}
      elapsed={elapsed === undefined ? undefined : formatElapsed(elapsed)}
      actions={actions}
      result={result}
    >
      {part.messages?.length ? (
        <ReadonlyThreadProvider messages={part.messages}>
          <ThreadPrimitive.Messages>{() => <NestedMessage />}</ThreadPrimitive.Messages>
        </ReadonlyThreadProvider>
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
  // Preserve the existing upstream labels; this seam introduces no new UI copy.
  const summary = [
    `${indices.length} tasks`,
    counts.running > 0 && `${counts.running} running`,
    counts.requiresAction > 0 && `${counts.requiresAction} waiting`,
    failed > 0 && `${failed} failed`,
  ].filter(Boolean).join(" · ");
  return (
    <div data-slot="aui_task-group" className={cn("flex w-full max-w-sm flex-col gap-2", className)}>
      <div data-slot="aui_task-group-summary" className="text-muted-foreground px-1 text-xs">{summary}</div>
      {indices.slice(0, visible).map((index, position) => <TaskLane key={laneKeys[position] ?? index} index={index} />)}
      {hidden > 0 && <button
        type="button" data-slot="aui_task-group-more"
        onClick={() => setVisible((count) => count + TASK_PAGE_SIZE)}
        className="text-muted-foreground hover:text-foreground w-fit px-1 text-xs transition-colors"
      >Show {Math.min(hidden, TASK_PAGE_SIZE)} more</button>}
    </div>
  );
}

export function ConversationTaskGroupComposition({ components, ...props }: {
  group: MessagePrimitive.GroupedParts.GroupPart;
  className?: string;
  components: TranscriptComponents;
}) {
  return <TranscriptContext.Provider value={components}><TaskLanes {...props} /></TranscriptContext.Provider>;
}
