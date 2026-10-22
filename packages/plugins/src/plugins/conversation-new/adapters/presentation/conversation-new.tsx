import type { ComponentProps, ReactNode } from "react";
import { PlusIcon as Plus } from "../../../../plugin-support.js";
import { ConversationThreadListNew, AgentUITooltip, AgentUITooltipTrigger, AgentUITooltipContent, useAgentUILocale, useAgentUISidebarNavigation } from "../../../../public.js";
export interface ConversationNewPluginProps {
  /** Application presentation; the accessible name remains present in icon-only mode. */
  showLabel?: boolean;
  renderSlot?: (name: string, fallback?: ReactNode) => ReactNode;
  rootProps?: ComponentProps<"div">; newProps?: ComponentProps<typeof ConversationThreadListNew>;
  tooltipProps?: ComponentProps<typeof AgentUITooltip>; tooltipContentProps?: ComponentProps<typeof AgentUITooltipContent>; children?: ReactNode;
}
export function CanonicalConversationNew({ rootProps, newProps, tooltipProps, tooltipContentProps, children, showLabel = true }: ConversationNewPluginProps) {
  const onNavigate = useAgentUISidebarNavigation();
  const messages = useAgentUILocale("threadList");
  return <div className="conversation-new-plugin" data-ui-plugin="conversation-new" data-show-label={showLabel} {...rootProps}>
    <AgentUITooltip {...tooltipProps}>
      <AgentUITooltipTrigger render={
        <ConversationThreadListNew
          aria-label={messages.newThread}
          {...newProps}
          className={["conversation-new-button", newProps?.className].filter(Boolean).join(" ")}
          onClick={event => {
            newProps?.onClick?.(event);
            if (!event.defaultPrevented) onNavigate();
          }}
        >
          {children ?? newProps?.children ?? (showLabel
            ? messages.newThread
            : <Plus data-slot="aui_thread-list-new-icon" className="size-4 shrink-0" aria-hidden="true" />)}
        </ConversationThreadListNew>
      } />
      <AgentUITooltipContent {...tooltipContentProps}>{tooltipContentProps?.children ?? messages.newThread}</AgentUITooltipContent>
    </AgentUITooltip>
  </div>;
}
