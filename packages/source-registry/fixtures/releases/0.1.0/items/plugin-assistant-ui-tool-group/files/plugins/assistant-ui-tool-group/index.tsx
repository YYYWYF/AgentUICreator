import {
  ConversationCanonicalToolGroup,
  type ConversationToolGroupRenderScope,
} from "@agent-ui/react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { usePluginRenderScope } from "../../runtime/plugins";

export function AssistantUiToolGroupPlugin(_props: UIPluginComponentProps) {
  const scope = usePluginRenderScope<ConversationToolGroupRenderScope>();
  if (scope?.kind !== "conversation.tool-group") return null;
  const { group, children } = scope.value;
  return <ConversationCanonicalToolGroup group={group}>{children}</ConversationCanonicalToolGroup>;
}
