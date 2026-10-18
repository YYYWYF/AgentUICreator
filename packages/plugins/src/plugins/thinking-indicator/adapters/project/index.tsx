import type { ComponentProps } from "react";
import { ConversationThinkingIndicator, type ConversationThinkingIndicatorRenderScope } from "@za38.03/agent-ui-plugins";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { usePluginRenderScope } from "../../runtime/plugins";
export function ConversationThinkingIndicatorPlugin({renderSlot:_renderSlot, renderScopedSlot:_renderScopedSlot, ...props}: UIPluginComponentProps & Partial<ComponentProps<typeof ConversationThinkingIndicator>>) {
  const scope=usePluginRenderScope<ConversationThinkingIndicatorRenderScope>();if(scope?.kind!=="conversation.thinking-indicator")return null;
  return <ConversationThinkingIndicator {...scope.value} {...props}/>;
}
