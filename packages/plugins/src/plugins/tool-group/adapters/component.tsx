import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { ConversationCanonicalToolGroup, type ConversationCanonicalToolGroupProps } from "@za38.03/agent-ui-plugins";
export function ConversationToolGroupPlugin({ group, ...props }: UIPluginComponentProps & Partial<ConversationCanonicalToolGroupProps>) {
  if (!group) return null;
  return <ConversationCanonicalToolGroup {...props} group={group} />;
}
