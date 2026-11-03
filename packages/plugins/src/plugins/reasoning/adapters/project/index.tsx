import {
  ConversationCanonicalReasoningGroup,
  type ConversationReasoningGroupRenderScope,
  type ConversationCanonicalReasoningGroupProps,
} from "@za38.03/agent-ui-plugins";
import type { UIPluginComponentProps } from "@za38.03/agent-ui-plugins/contracts";
import { usePluginRenderScope } from "@za38.03/agent-ui-runtime/ui/runtime/plugins/index";

export function ConversationReasoningPlugin(props: UIPluginComponentProps & Partial<ConversationCanonicalReasoningGroupProps>) {
  const scope = usePluginRenderScope<ConversationReasoningGroupRenderScope>();
  if (scope?.kind !== "conversation.reasoning-group") return null;
  const { group, children } = scope.value;
  return <ConversationCanonicalReasoningGroup {...props} group={group}>{props.children ?? children}</ConversationCanonicalReasoningGroup>;
}
