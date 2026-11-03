import type { ComponentProps, ReactNode } from "react";
import type { ComponentType } from "react";
import { useAgentUILocale, type ConversationThreadLabels } from "../../../../public.js";
export interface ConversationSurfaceAdapterProps { autoFocus?: boolean; className?: string; rendererSlots?: {toolTimeline?:boolean;reasoningGroup?:boolean;thinkingIndicator?:boolean;transientMessages?:boolean};labels?:ConversationThreadLabels;welcome?:ReactNode;suggestions?:ReactNode;composer?:ReactNode;renderScopedSlot?:(name:string,scope:{kind:string;value:unknown},fallback?:ReactNode)=>ReactNode; }
export interface ConversationSurfacePluginProps extends Omit<ComponentProps<"div">, "children"> { renderSlot?:(name:string,fallback?:ReactNode)=>ReactNode;renderScopedSlot?:(name:string,scope:{kind:string;value:unknown},fallback?:ReactNode)=>ReactNode;Adapter?:ComponentType<ConversationSurfaceAdapterProps>;rendererSlots?:ConversationSurfaceAdapterProps["rendererSlots"];snapshot?:{mode?:string;detailStatus?:string};autoFocus?: boolean; labels?: ConversationThreadLabels; welcome?: ReactNode; suggestions?: ReactNode; composer?: ReactNode; }
export function CanonicalConversationSurfacePlugin({ renderSlot = (_name,fallback)=>fallback, renderScopedSlot = (_name,_scope,fallback)=>fallback, Adapter, rendererSlots, snapshot, autoFocus, labels, welcome: welcomeContent, suggestions: suggestionContent, composer: composerContent, ...rootProps}: ConversationSurfacePluginProps) {
  const messages=useAgentUILocale("conversation");
  const welcome = renderSlot("emptyWelcome", welcomeContent);
  const suggestions = renderSlot("emptySuggestions", suggestionContent ?? null);
  const headerActions = renderSlot("headerActions", null);
  const composer = renderSlot("composer", composerContent ?? null);
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
      {...rootProps} className={["conversation-surface-plugin", rootProps.className].filter(Boolean).join(" ")}
      data-conversation-detail-status={snapshot?.detailStatus}
      data-conversation-mode={snapshot?.mode}

      data-ui-plugin="conversation-surface"
    >
      <div
        className="conversation-surface-header-actions"
        data-conversation-surface-slot="headerActions"
      >
        {headerActions}
      </div>
      {Adapter ? <Adapter
        {...(autoFocus === undefined ? {} : { autoFocus })}
        {...(rendererSlots === undefined ? {} : {rendererSlots})}
        labels={{...messages,...labels}}
        welcome={welcome}
        suggestions={suggestions}
        composer={composer}
        renderScopedSlot={renderConversationScopedSlot}
      /> : null}
    </div>
  );
}
