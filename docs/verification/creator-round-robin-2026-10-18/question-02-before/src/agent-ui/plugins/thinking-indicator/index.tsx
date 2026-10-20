import { ConversationThinkingIndicatorPlugin as Implementation } from "@za38.03/agent-ui-plugins/thinking-indicator";
import type { ComponentProps } from "react";
import { usePluginRenderScope } from "../../runtime/plugins";

export function ConversationThinkingIndicatorPlugin(props: ComponentProps<typeof Implementation>) {
  const scope = usePluginRenderScope<Partial<ComponentProps<typeof Implementation>>>();
  if (scope?.kind !== "conversation.thinking-indicator") return null;
  return <Implementation {...scope.value} {...props} />;
}
