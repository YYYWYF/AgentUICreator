import { ConversationToolTimeline, type ConversationToolTimelineRenderScope } from "@za38.03/agent-ui-plugins";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { usePluginRenderScope } from "../../runtime/plugins";
export function AssistantUiToolTimelinePlugin(_props: UIPluginComponentProps) {
  const scope = usePluginRenderScope<ConversationToolTimelineRenderScope>();
  if (scope?.kind !== "conversation.tool-timeline") return null;
  return <ConversationToolTimeline>{scope.value.children}</ConversationToolTimeline>;
}
