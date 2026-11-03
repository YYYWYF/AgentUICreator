import type { ComponentProps, ReactNode } from "react";
import { PlusIcon as Plus } from "../../../../plugin-support.js";
import { ConversationThreadListNew, AgentUITooltip, AgentUITooltipTrigger, AgentUITooltipContent, useAgentUILocale, useAgentUISidebarNavigation } from "../../../../public.js";
export interface ConversationNewPluginProps extends Omit<ComponentProps<"div">, "children" | "onClick"> {
  /** Application presentation; the accessible name remains present in icon-only mode. */
  onClick?: ComponentProps<typeof ConversationThreadListNew>["onClick"];
  showLabel?: boolean;
  disabled?: boolean;
  renderSlot?: (name: string, fallback?: ReactNode) => ReactNode;
  renderScopedSlot?: (name: string, scope: { kind: string; value: unknown }, fallback?: ReactNode) => ReactNode;
   buttonProps?: ComponentProps<typeof ConversationThreadListNew>;
  tooltipProps?: ComponentProps<typeof AgentUITooltip>; tooltipContentProps?: ComponentProps<typeof AgentUITooltipContent>; children?: ReactNode;
}
export function CanonicalConversationNew({renderSlot: _renderSlot, renderScopedSlot: _renderScopedSlot, buttonProps, tooltipProps, tooltipContentProps, children, showLabel = true, disabled, onClick, ...rootProps}: ConversationNewPluginProps) {
  const onNavigate = useAgentUISidebarNavigation();
  const messages = useAgentUILocale("threadList");
  return <div {...rootProps} className={["conversation-new-plugin", rootProps.className].filter(Boolean).join(" ")} data-ui-plugin="conversation-new" data-show-label={showLabel} >
    <AgentUITooltip {...tooltipProps}>
      <AgentUITooltipTrigger render={
        <ConversationThreadListNew
          disabled={disabled} aria-label={messages.newThread}
          {...buttonProps}
          className={["conversation-new-button", buttonProps?.className].filter(Boolean).join(" ")}
          onClick={event => {
            buttonProps?.onClick?.(event);
            onClick?.(event);
            if (!event.defaultPrevented) onNavigate();
          }}
        >
          {children ?? buttonProps?.children ?? (showLabel
            ? messages.newThread
            : <Plus data-slot="aui_thread-list-new-icon" className="size-4 shrink-0" aria-hidden="true" />)}
        </ConversationThreadListNew>
      } />
      <AgentUITooltipContent {...tooltipContentProps}>{tooltipContentProps?.children ?? messages.newThread}</AgentUITooltipContent>
    </AgentUITooltip>
  </div>;
}
