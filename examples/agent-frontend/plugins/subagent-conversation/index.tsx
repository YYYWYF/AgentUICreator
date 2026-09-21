import {
  ConversationSubagentTool,
  type ConversationSubagentRenderScope,
} from "@agent-ui/react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { usePluginRenderScope } from "../../runtime/plugins";

export function SubagentConversationPlugin(_props: UIPluginComponentProps) {
  const scope = usePluginRenderScope<ConversationSubagentRenderScope>();
  if (scope?.kind !== "conversation.subagent") return null;
  return <ConversationSubagentTool {...scope.value.tool} />;
}
