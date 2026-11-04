'use client';
import { useState, type ComponentProps, type ReactNode } from 'react';
import {
  FileSearchIcon,
  PenLineIcon,
  SearchIcon,
  TerminalIcon,
  ToolTimeline,
  WrenchIcon,
  formatPresentationMessage,
  projectToolTimeline,
  timelineToolKind,
  useAgentUILocale,
  useAuiState,
} from '../../../../plugin-support.js';
export interface ConversationToolTimelineProps extends Omit<ComponentProps<'div'>, 'children'> {
  /** Supplied by the conversation scope; tool details render independently. */
  children?: ReactNode;
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  restingLabel?: string;
  activeLabel?: string;
  visibleSteps?: number;
}
export function InternalConversationToolTimeline({
  children: _children,
  expanded,
  defaultExpanded = false,
  onExpandedChange,
  restingLabel,
  activeLabel,
  visibleSteps,
  ...elementProps
}: ConversationToolTimelineProps) {
  const messages = useAgentUILocale('toolTimeline');
  const parts = useAuiState((s) => s.message.parts);
  const tools = useAuiState((s) => s.tools.toolUIs);
  const projection = projectToolTimeline(parts, tools);
  const [open, setOpen] = useState(defaultExpanded);
  const effectiveOpen = expanded ?? open;
  const icons = {
    read: FileSearchIcon,
    edit: PenLineIcon,
    command: TerminalIcon,
    search: SearchIcon,
    tool: WrenchIcon,
  };
  const steps = projection.calls.map((call) => {
    const kind = timelineToolKind(call.toolName);
    return {
      id: call.toolCallId,
      chip: call.target,
      verb: kind === 'tool' ? call.toolName || messages.tool : messages[kind],
      icon: icons[kind],
    };
  });
  if (!projection.anchorId) {
    return null;
  }
  return (
    <div
      data-slot='agent-ui-tool-timeline'
      {...elementProps}
      className={['min-w-0 max-w-full', elementProps.className].filter(Boolean).join(' ')}
    >
      <ToolTimeline
        steps={steps}
        visibleSteps={visibleSteps ?? steps.length}
        streaming={projection.streaming}
        restingLabel={
          restingLabel ??
          formatPresentationMessage(
            projection.stats.length === 1
              ? messages.summaryWithOneFile
              : projection.stats.length
                ? messages.summaryWithFiles
                : projection.calls.every((call) => call.status === 'complete')
                  ? messages.summary
                  : messages.pendingSummary,
            { count: steps.length, files: projection.stats.length },
          )
        }
        activeLabel={activeLabel ?? formatPresentationMessage(messages.active, { count: steps.length })}
        stats={projection.stats}
        open={effectiveOpen}
        onOpenChange={(value) => {
          setOpen(value);
          onExpandedChange?.(value);
        }}
      />
    </div>
  );
}

export { InternalConversationToolTimeline as ConversationToolTimeline };
