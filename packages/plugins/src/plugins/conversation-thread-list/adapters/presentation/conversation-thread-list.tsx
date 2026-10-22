import type { ComponentProps, ReactNode } from "react";
import { PlusIcon as Plus } from "../../../../plugin-support.js";
import { getAgentUIThemeColorScheme, Button, useConversationNavigation, ConversationThreadListNew, useAgentUISidebarNavigation, AgentUITooltip, AgentUITooltipTrigger, AgentUITooltipContent, useAgentUILocale, type AgentUITheme } from "../../../../public.js";
import { PolicyThreadList, type PolicyThreadListProps } from "./PolicyThreadList.js";
export interface ConversationThreadListPluginProps {
  renderSlot?: (name: string, fallback?: ReactNode) => ReactNode;
  rootProps?: ComponentProps<"aside">; listProps?: Omit<PolicyThreadListProps, "labels">; children?: ReactNode;
  snapshot?: { activeConversationId?: string | undefined; listStatus?: string; detailStatus?: string; listError?: string | undefined; detailError?: string | undefined; detailErrorConversationId?: string | undefined };
  serviceAvailable?: boolean; onRefresh?: () => void | Promise<void>; theme?: AgentUITheme; runStatus?: string;
}
export function CanonicalConversationThreadList({rootProps, listProps, children, snapshot = {}, onRefresh, serviceAvailable = false, theme = "light", runStatus}: ConversationThreadListPluginProps) {
  const labels = useAgentUILocale("threadList");
  const conversationNavigation = useConversationNavigation();

  return (
    <aside
      {...rootProps}
      className={[
        "conversation-thread-list-plugin agent-ui-conversation",
        getAgentUIThemeColorScheme(theme) === "dark" ? "dark" : undefined,
        rootProps?.className,
      ].filter(Boolean).join(" ")}
      data-agent-run-status={runStatus}
      data-conversation-list-status={snapshot.listStatus}
      data-conversation-detail-status={snapshot.detailStatus}
      data-theme={theme}
      data-color-scheme={getAgentUIThemeColorScheme(theme)}
      data-ui-plugin="conversation-thread-list"
    >
      {children ?? rootProps?.children ?? <PolicyThreadList labels={labels} {...listProps} />}

      {snapshot.listStatus === "error" ? (
        <div className="conversation-thread-list-error" role="alert">
          <strong>{labels.loadFailed}</strong>
          {snapshot.listError === undefined ? null : (
            <span>{snapshot.listError}</span>
          )}
          <Button
            disabled={!serviceAvailable}
            onClick={() => {
              void onRefresh?.();
            }}
            size="sm"
            variant="outline"
          >
            {labels.retry}
          </Button>
        </div>
      ) : null}

      {snapshot.detailStatus === "error" ? (
        <div
          className="conversation-thread-list-error"
          data-slot="agent-ui-thread-detail-error"
          role="alert"
        >
          <strong>{labels.historyFailed}</strong>
          {snapshot.detailError === undefined ? null : (
            <span>{snapshot.detailError}</span>
          )}
          <Button
            disabled={
              !serviceAvailable ||
              snapshot.detailErrorConversationId === undefined
            }
            onClick={() => {
              const failedConversationId = snapshot.detailErrorConversationId;
              if (failedConversationId === undefined) return;
              if (snapshot.activeConversationId === failedConversationId) {
                void conversationNavigation.reloadCurrentThread();
              } else {
                void conversationNavigation.switchToThread(failedConversationId);
              }
            }}
            size="sm"
            variant="outline"
          >
            {labels.retry}
          </Button>
        </div>
      ) : null}
    </aside>
  );
}

export interface ConversationThreadListRailActionProps { renderSlot?: (name: string, fallback?: ReactNode) => ReactNode; enabled?: boolean; newProps?: ComponentProps<typeof ConversationThreadListNew>; tooltipProps?: ComponentProps<typeof AgentUITooltip>; tooltipContentProps?: ComponentProps<typeof AgentUITooltipContent>; }
/** @deprecated Place the independent conversation-new Plugin in the application layout. */
export function CanonicalConversationThreadListRailAction({enabled = true, newProps, tooltipProps, tooltipContentProps}: ConversationThreadListRailActionProps) {
  const labels = useAgentUILocale("threadList");
  const navigate = useAgentUISidebarNavigation();
  if (!enabled) return null;
  return <AgentUITooltip {...tooltipProps}>
    <AgentUITooltipTrigger render={<ConversationThreadListNew
      className="conversation-thread-list-rail-new" aria-label={labels.newThread} {...newProps} onClick={event => { newProps?.onClick?.(event); if (!event.defaultPrevented) navigate(); }}>
      {newProps?.children ?? <Plus aria-hidden="true" />}
    </ConversationThreadListNew>} />
    <AgentUITooltipContent side="right" {...tooltipContentProps}>{tooltipContentProps?.children ?? labels.newThread}</AgentUITooltipContent>
  </AgentUITooltip>;
}
