"use client";
import { useState, type ReactNode } from "react";
import { useAuiState } from "@assistant-ui/react";
import { FileTextIcon, TerminalIcon, SearchIcon, WrenchIcon } from "lucide-react";
import { useAgentUILocale, formatPresentationMessage } from "../locale.js";
import { ToolTimeline } from "./vendor/assistant-ui/components/assistant-ui/elements/tool-timeline.js";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./vendor/assistant-ui/components/ui/collapsible.js";
import { projectToolTimeline, timelineToolKind, type TimelineCall } from "./tool-timeline-projection.js";

export function InternalConversationToolTimeline({ children }: { children?: ReactNode }) {
  const messages = useAgentUILocale("toolTimeline");
  const parts = useAuiState(s => s.message.parts);
  const tools = useAuiState(s => s.tools.toolUIs);
  const projection = projectToolTimeline(parts, tools);
  const [open, setOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const icons = { read: FileTextIcon, command: TerminalIcon, search: SearchIcon, tool: WrenchIcon };
  const statusLabel = (call: TimelineCall) => {
    if (call.status === "complete") return messages.complete;
    if (call.status === "running") return messages.running;
    if (call.status === "requires-action") return messages.waiting;
    if (call.status === "incomplete") {
      if (call.reason === "cancelled") return messages.cancelled;
      if (call.reason === "error") return messages.failed;
      return messages.interrupted;
    }
    return messages.unknown;
  };
  const steps = projection.calls.map((call, index) => {
    const kind = timelineToolKind(call.toolName);
    return {
      // Pinned upstream keys by chip, not a newer TimelineStep.id. Unique,
      // stable ordinal chips contain no arguments, paths, or sensitive data.
      chip: String(index + 1),
      verb: `${kind === "tool" ? call.toolName || messages.tool : messages[kind]} · ${statusLabel(call)}`,
      icon: icons[kind],
    };
  });
  if (!projection.anchorId) return null;
  return <div data-slot="agent-ui-tool-timeline" className="min-w-0 max-w-full [&_button]:focus-visible:ring-2 [&_button]:focus-visible:ring-ring [&_[data-slot=collapsible-trigger]]:min-w-0 [&_[data-slot=collapsible-trigger]]:max-w-full [&_[data-slot=collapsible-trigger]]:break-words [&_div]:min-w-0 [&_div]:motion-reduce:animate-none [&_button]:motion-reduce:transition-none [&_span]:max-w-full [&_span]:min-w-0 [&_span]:break-all [&_span]:motion-reduce:animate-none">
    <ToolTimeline steps={steps} visibleSteps={steps.length} streaming={projection.streaming}
      restingLabel={formatPresentationMessage(projection.calls.every(call => call.status === "complete") ? messages.summary : messages.pendingSummary, { count: steps.length })}
      activeLabel={formatPresentationMessage(messages.active, { count: steps.length })}
      stats={[]} open={open} onOpenChange={setOpen} className="min-w-0 max-w-full" />
    {open && children ? <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
      <CollapsibleTrigger className="rounded-md py-1 text-sm text-muted-foreground">{messages.details}</CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible> : null}
  </div>;
}
