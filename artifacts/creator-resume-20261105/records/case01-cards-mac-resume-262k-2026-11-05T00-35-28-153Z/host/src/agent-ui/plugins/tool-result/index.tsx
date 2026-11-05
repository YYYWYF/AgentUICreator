import { ConversationToolResultPlugin as Implementation } from "@za38.03/agent-ui-plugins/tool-result";
import type { ComponentProps } from "react";
import { usePluginRenderScope } from "@za38.03/agent-ui-plugins";

export function ConversationToolResultPlugin(props: ComponentProps<typeof Implementation>) {
  const scope = usePluginRenderScope<Partial<ComponentProps<typeof Implementation>>>();
  if (scope?.kind !== "conversation.tool-fallback") return null;
  return <Implementation {...scope.value} {...props} />;
}
