import { useEffect, useState, useRef, type ComponentProps, type ReactNode } from "react";
import { HistoryIcon as History } from "../../../../plugin-support.js";
import { AgentUIPopover, AgentUIPopoverTrigger, AgentUIPopoverContent, useAgentUILocale } from "../../../../public.js";
export interface ConversationHistoryPluginProps {
  activeConversationId?: string | undefined;
  renderSlot?: (name: string, fallback?: ReactNode) => ReactNode;
  rootProps?: ComponentProps<"div">; triggerProps?: ComponentProps<typeof AgentUIPopoverTrigger>;
  popoverProps?: ComponentProps<typeof AgentUIPopover>; contentProps?: ComponentProps<typeof AgentUIPopoverContent>;
  children?: ReactNode;
}
export function CanonicalConversationHistory({ activeConversationId, renderSlot = (_name, fallback) => fallback, rootProps, triggerProps, popoverProps, contentProps, children }: ConversationHistoryPluginProps) {
  const messages = useAgentUILocale("threadList");
  const [internalOpen, setOpen] = useState(popoverProps?.defaultOpen ?? false);
  const open = popoverProps?.open ?? internalOpen;
  const changeOpen: NonNullable<ComponentProps<typeof AgentUIPopover>["onOpenChange"]> = (value, event) => { popoverProps?.onOpenChange?.(value, event); if (!event.isCanceled) setOpen(value); };
  const actions = useRef<{ close: () => void; unmount: () => void } | null>(null);
  const previousId = useRef(activeConversationId);
  useEffect(() => { if (previousId.current !== activeConversationId) { (popoverProps?.actionsRef ?? actions).current?.close(); previousId.current = activeConversationId; } }, [activeConversationId]);
  return <div className="conversation-history-plugin" data-ui-plugin="conversation-history" {...rootProps}>
    <AgentUIPopover {...popoverProps} actionsRef={popoverProps?.actionsRef ?? actions} open={open} onOpenChange={changeOpen}>
      <AgentUIPopoverTrigger className="conversation-history-button" aria-label={messages.historyTitle} title={messages.historyTitle} {...triggerProps}>
        {triggerProps?.children ?? <History aria-hidden="true" />}
      </AgentUIPopoverTrigger>
      <AgentUIPopoverContent align="end" sideOffset={12} className="conversation-history-popover" aria-label={messages.historyTitle} {...contentProps}>
        {children ?? contentProps?.children ?? <><h2>{messages.historyTitle}</h2>{renderSlot("content", <p>{messages.empty}</p>)}</>}
      </AgentUIPopoverContent>
    </AgentUIPopover>
  </div>;
}
