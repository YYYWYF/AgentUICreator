import type { ComponentProps, ReactNode } from "react";
import { SquarePenIcon as SquarePen } from "../../../../plugin-support.js";
import { ConversationThreadListNew, AgentUITooltip, AgentUITooltipTrigger, AgentUITooltipContent, useAgentUILocale } from "../../../../public.js";
export interface ConversationNewPluginProps {
  renderSlot?: (name: string, fallback?: ReactNode) => ReactNode;
  rootProps?: ComponentProps<"div">; newProps?: ComponentProps<typeof ConversationThreadListNew>;
  tooltipProps?: ComponentProps<typeof AgentUITooltip>; tooltipContentProps?: ComponentProps<typeof AgentUITooltipContent>; children?: ReactNode;
}
export function CanonicalConversationNew({ rootProps, newProps, tooltipProps, tooltipContentProps, children }: ConversationNewPluginProps) {
  const messages = useAgentUILocale("threadList");
  return <div className="conversation-new-plugin" data-ui-plugin="conversation-new" {...rootProps}>
    <AgentUITooltip {...tooltipProps}>
      <AgentUITooltipTrigger render={<ConversationThreadListNew className="conversation-new-button" aria-label={messages.newThread} {...newProps}>{children ?? newProps?.children ?? <SquarePen aria-hidden="true" />}</ConversationThreadListNew>} />
      <AgentUITooltipContent {...tooltipContentProps}>{tooltipContentProps?.children ?? messages.newThread}</AgentUITooltipContent>
    </AgentUITooltip>
  </div>;
}
