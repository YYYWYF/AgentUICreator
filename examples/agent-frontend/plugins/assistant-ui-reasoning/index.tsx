import {
  ConversationCanonicalReasoningGroup,
  type ConversationReasoningGroupRenderScope,
} from "@agent-ui/react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { usePluginRenderScope } from "../../runtime/plugins";

export function AssistantUiReasoningPlugin(_props: UIPluginComponentProps) {
  const scope = usePluginRenderScope<ConversationReasoningGroupRenderScope>();
  if (scope?.kind !== "conversation.reasoning-group") return null;
  const { group, children } = scope.value;
  return <ConversationCanonicalReasoningGroup group={group}>{children}</ConversationCanonicalReasoningGroup>;
}
