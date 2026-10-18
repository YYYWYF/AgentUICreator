import {
  ConversationCanonicalToolGroup,
  type ConversationToolGroupRenderScope,
  type ConversationCanonicalToolGroupProps,
} from "@za38.03/agent-ui-plugins";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { usePluginRenderScope } from "../../runtime/plugins";

export function ConversationToolGroupPlugin(props: UIPluginComponentProps & Partial<ConversationCanonicalToolGroupProps>) {
  const scope = usePluginRenderScope<ConversationToolGroupRenderScope>();
  if (scope?.kind !== "conversation.tool-group") return null;
  const { group, children } = scope.value;
  return <ConversationCanonicalToolGroup {...props} group={group}>{props.children ?? children}</ConversationCanonicalToolGroup>;
}
