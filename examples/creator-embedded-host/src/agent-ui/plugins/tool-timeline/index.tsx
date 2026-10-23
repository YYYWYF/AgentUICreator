import { ConversationToolTimelinePlugin as Implementation } from "@za38.03/agent-ui-plugins/tool-timeline";
import type { ComponentProps } from "react";
import { usePluginRenderScope } from "../../runtime/plugins";

export function ConversationToolTimelinePlugin(props: ComponentProps<typeof Implementation>) {
  const scope = usePluginRenderScope<Partial<ComponentProps<typeof Implementation>>>();
  if (scope?.kind !== "conversation.tool-timeline") return null;
  return <Implementation {...scope.value} {...props} />;
}
