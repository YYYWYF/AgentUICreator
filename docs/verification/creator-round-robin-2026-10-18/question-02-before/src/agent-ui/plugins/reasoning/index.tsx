import { ConversationReasoningPlugin as Implementation } from "@za38.03/agent-ui-plugins/reasoning";
import type { ComponentProps } from "react";
import { usePluginRenderScope } from "../../runtime/plugins";

export function ConversationReasoningPlugin(props: ComponentProps<typeof Implementation>) {
  const scope = usePluginRenderScope<Partial<ComponentProps<typeof Implementation>>>();
  if (scope?.kind !== "conversation.reasoning-group") return null;
  return <Implementation {...scope.value} {...props} />;
}
