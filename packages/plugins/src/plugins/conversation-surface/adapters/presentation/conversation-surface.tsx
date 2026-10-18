import type { ComponentProps, ReactNode } from "react";
import type { ComponentType } from "react";
import { useAgentUILocale, type ConversationThreadLabels } from "../../../../public.js";
export interface ConversationSurfaceAdapterProps { rendererSlots?: {toolTimeline?:boolean;reasoningGroup?:boolean;thinkingIndicator?:boolean;transientMessages?:boolean};labels?:ConversationThreadLabels;welcome?:ReactNode;suggestions?:ReactNode;composer?:ReactNode;renderScopedSlot?:(name:string,scope:{kind:string;value:unknown},fallback?:ReactNode)=>ReactNode; }
export interface ConversationSurfacePluginProps { renderSlot?:(name:string,fallback?:ReactNode)=>ReactNode;renderScopedSlot?:(name:string,scope:{kind:string;value:unknown},fallback?:ReactNode)=>ReactNode;Adapter?:ComponentType<ConversationSurfaceAdapterProps>;welcomeFallback?:ReactNode;rendererSlots?:ConversationSurfaceAdapterProps["rendererSlots"];snapshot?:{mode?:string;detailStatus?:string};rootProps?:ComponentProps<"div">;adapterProps?:Partial<ConversationSurfaceAdapterProps>; }
export function CanonicalConversationSurfacePlugin({ renderSlot = (_name,fallback)=>fallback, renderScopedSlot = (_name,_scope,fallback)=>fallback, Adapter, welcomeFallback, rendererSlots, snapshot, rootProps, adapterProps }: ConversationSurfacePluginProps) {
  const messages=useAgentUILocale("conversation");
  const welcome = renderSlot("emptyWelcome", welcomeFallback);
  const suggestions = renderSlot("emptySuggestions", null);
  const headerActions = renderSlot("headerActions", null);
  const composer = renderSlot("composer", null);
  const renderConversationScopedSlot = (
    slotName: string,
    scope: {kind:string;value:unknown},
    fallback?: ReactNode,
  ): ReactNode => {
    switch (slotName) {
      case "transientMessages": return renderScopedSlot("transientMessages", scope, fallback);
      case "userEditComposer": return renderScopedSlot("userEditComposer", scope, fallback);
      case "reasoningGroup": return renderScopedSlot("reasoningGroup", scope, fallback);
      case "thinkingIndicator": return renderScopedSlot("thinkingIndicator", scope, fallback);
      case "toolTimeline": return renderScopedSlot("toolTimeline", scope, fallback);
      case "toolGroup": return renderScopedSlot("toolGroup", scope, fallback);
      case "toolFallback": return renderScopedSlot("toolFallback", scope, fallback);
      case "taskGroup": return renderScopedSlot("taskGroup", scope, fallback);
      case "assistantResponseFooter": return renderScopedSlot("assistantResponseFooter", scope, fallback);
      default: throw new Error(`Unknown Conversation renderer Slot "${slotName}"`);
    }
  };

  return (
    <div
      className="conversation-surface-plugin"
      data-conversation-detail-status={snapshot?.detailStatus}
      data-conversation-mode={snapshot?.mode}
      {...rootProps}
      data-ui-plugin="conversation-surface"
    >
      <div
        className="conversation-surface-header-actions"
        data-conversation-surface-slot="headerActions"
      >
        {headerActions}
      </div>
      {Adapter ? <Adapter
        {...adapterProps}
        {...(rendererSlots === undefined ? {} : {rendererSlots})}
        labels={messages}
        welcome={welcome}
        suggestions={suggestions}
        composer={composer}
        renderScopedSlot={renderConversationScopedSlot}
      /> : null}
    </div>
  );
}
