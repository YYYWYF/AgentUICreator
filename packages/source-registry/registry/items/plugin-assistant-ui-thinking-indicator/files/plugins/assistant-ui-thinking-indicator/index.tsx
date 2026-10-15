import { ConversationThinkingIndicator, type ConversationThinkingIndicatorRenderScope } from "@za38.03/agent-ui-plugins";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { usePluginRenderScope } from "../../runtime/plugins";
export function AssistantUiThinkingIndicatorPlugin(_props: UIPluginComponentProps) {
  const scope = usePluginRenderScope<ConversationThinkingIndicatorRenderScope>();
  if (scope?.kind !== "conversation.thinking-indicator") return null;
  return <ConversationThinkingIndicator {...scope.value} />;
}
