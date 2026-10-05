import {
  ConversationTaskGroup,
  type ConversationTaskGroupRenderScope,
} from "@agent-ui/react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { usePluginRenderScope } from "../../runtime/plugins";

export function TaskGroupPlugin(_props: UIPluginComponentProps) {
  const scope = usePluginRenderScope<ConversationTaskGroupRenderScope>();
  if (scope?.kind !== "conversation.task-group") return null;
  return <ConversationTaskGroup group={scope.value.group} />;
}
