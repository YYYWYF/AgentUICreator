import { ConversationToolGroupPlugin as Implementation } from "@za38.03/agent-ui-plugins/tool-group";
import type { ComponentProps } from "react";
import { usePluginRenderScope } from "../../runtime/plugins";

export function ConversationToolGroupPlugin(props: ComponentProps<typeof Implementation>) {
  const scope = usePluginRenderScope<Partial<ComponentProps<typeof Implementation>>>();
  if (scope?.kind !== "conversation.tool-group") return null;
  return <Implementation {...scope.value} {...props} />;
}
