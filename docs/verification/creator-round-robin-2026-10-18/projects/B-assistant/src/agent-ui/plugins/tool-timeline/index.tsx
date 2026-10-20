import { ConversationToolTimelinePlugin as Implementation } from "./source/index";
import type { ComponentProps } from "react";
import { usePluginRenderScope } from "../../runtime/plugins";

export function ConversationToolTimelinePlugin(props: ComponentProps<typeof Implementation>) {
  const scope = usePluginRenderScope<Partial<ComponentProps<typeof Implementation>>>();
  if (scope?.kind !== "conversation.tool-timeline") return null;
  return <Implementation {...scope.value} {...props} />;
}
