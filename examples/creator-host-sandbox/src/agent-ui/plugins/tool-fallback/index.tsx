import { ConversationToolFallbackPlugin as Implementation } from "@za38.03/agent-ui-plugins/tool-fallback";
import type { ComponentProps } from "react";
import { usePluginRenderScope } from "../../runtime/plugins";

export function ConversationToolFallbackPlugin(props: ComponentProps<typeof Implementation>) {
  const scope = usePluginRenderScope<Partial<ComponentProps<typeof Implementation>>>();
  if (scope?.kind !== "conversation.tool-fallback") return null;
  return <Implementation {...scope.value} {...props} />;
}
