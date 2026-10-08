import { ConversationToolTimeline, type ConversationToolTimelineRenderScope } from "@agent-ui/react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { usePluginRenderScope } from "../../runtime/plugins";
export function AssistantUiToolTimelinePlugin(_props: UIPluginComponentProps) {
  const scope = usePluginRenderScope<ConversationToolTimelineRenderScope>();
  if (scope?.kind !== "conversation.tool-timeline") return null;
  return <ConversationToolTimeline>{scope.value.children}</ConversationToolTimeline>;
}
