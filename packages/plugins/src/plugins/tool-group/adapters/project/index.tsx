import {
  ConversationCanonicalToolGroup,
  type ConversationToolGroupRenderScope,
  type ConversationCanonicalToolGroupProps,
} from "@za38.03/agent-ui-plugins";
import type { UIPluginComponentProps } from "@za38.03/agent-ui-plugins/contracts";
import { usePluginRenderScope } from "@za38.03/agent-ui-runtime/ui/runtime/plugins/index";

export function ConversationToolGroupPlugin(props: UIPluginComponentProps & Partial<ConversationCanonicalToolGroupProps>) {
  const scope = usePluginRenderScope<ConversationToolGroupRenderScope>();
  if (scope?.kind !== "conversation.tool-group") return null;
  const { group, children } = scope.value;
  return <ConversationCanonicalToolGroup {...props} group={group}>{props.children ?? children}</ConversationCanonicalToolGroup>;
}
