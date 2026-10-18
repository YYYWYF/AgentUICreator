import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { ConversationCanonicalReasoningGroup, type ConversationCanonicalReasoningGroupProps } from "@za38.03/agent-ui-plugins";
export function ConversationReasoningPlugin({ group, ...props }: UIPluginComponentProps & Partial<ConversationCanonicalReasoningGroupProps>) {
  if (!group) return null;
  return <ConversationCanonicalReasoningGroup {...props} group={group} />;
}
