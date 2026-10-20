"use client";
import { useState, type ReactNode, type ComponentProps } from "react";
import { useAuiState, FileTextIcon, TerminalIcon, SearchIcon, WrenchIcon, useAgentUILocale, formatPresentationMessage, ToolTimeline, Collapsible, CollapsibleTrigger, CollapsibleContent, projectToolTimeline, timelineToolKind, type TimelineCall } from "@za38.03/agent-ui-plugins/plugin-support";
export interface ConversationToolTimelineProps {
  children?: ReactNode; rootProps?: ComponentProps<"div">;
  timelineProps?: Partial<ComponentProps<typeof ToolTimeline>>;
  detailsProps?: ComponentProps<typeof Collapsible>;
  detailsTriggerProps?: ComponentProps<typeof CollapsibleTrigger>;
  detailsContentProps?: ComponentProps<typeof CollapsibleContent>;
  defaultOpen?: boolean; defaultDetailsOpen?: boolean;
}
export function InternalConversationToolTimeline({children, rootProps, timelineProps, detailsProps, detailsTriggerProps, detailsContentProps, defaultOpen = false, defaultDetailsOpen = false}: ConversationToolTimelineProps) {
  const messages = useAgentUILocale("toolTimeline");
  const parts = useAuiState(s => s.message.parts);
  const tools = useAuiState(s => s.tools.toolUIs);
  const projection = projectToolTimeline(parts, tools);
  const [open, setOpen] = useState(defaultOpen);
  const [detailsOpen, setDetailsOpen] = useState(defaultDetailsOpen);
  const effectiveOpen = timelineProps?.open ?? open;
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
  return <div data-slot="agent-ui-tool-timeline" className="min-w-0 max-w-full [&_button]:focus-visible:ring-2 [&_button]:focus-visible:ring-ring [&_[data-slot=collapsible-trigger]]:min-w-0 [&_[data-slot=collapsible-trigger]]:max-w-full [&_[data-slot=collapsible-trigger]]:break-words [&_div]:min-w-0 [&_div]:motion-reduce:animate-none [&_button]:motion-reduce:transition-none [&_span]:max-w-full [&_span]:min-w-0 [&_span]:break-all [&_span]:motion-reduce:animate-none" {...rootProps}>
    <ToolTimeline steps={steps} visibleSteps={steps.length} streaming={projection.streaming}
      restingLabel={formatPresentationMessage(projection.calls.every(call => call.status === "complete") ? messages.summary : messages.pendingSummary, { count: steps.length })}
      activeLabel={formatPresentationMessage(messages.active, { count: steps.length })}
      stats={[]} className="min-w-0 max-w-full" {...timelineProps} open={effectiveOpen} onOpenChange={value=>{setOpen(value);timelineProps?.onOpenChange?.(value);}} />
    {effectiveOpen && children ? <Collapsible {...detailsProps} open={detailsProps?.open ?? detailsOpen} onOpenChange={(value, event)=>{detailsProps?.onOpenChange?.(value,event);if(!event.isCanceled)setDetailsOpen(value);}}>
      <CollapsibleTrigger data-agent-ui-owned="" className="rounded-md py-1 text-sm text-muted-foreground" {...detailsTriggerProps}>{messages.details}</CollapsibleTrigger>
      <CollapsibleContent {...detailsContentProps}>
        <div data-slot="agent-ui-tool-timeline-details" className="flex flex-col gap-2">{children}</div>
      </CollapsibleContent>
    </Collapsible> : null}
  </div>;
}

export {InternalConversationToolTimeline as ConversationToolTimeline};
