import { useConversationActions } from "../../hooks/useConversationActions";
import { ConversationThreadListPlugin as Implementation } from "@za38.03/agent-ui-plugins/conversation-thread-list";
import type { ComponentProps } from "react";
import { useConversations } from "../../hooks/useConversations";
import { useAgentUITheme } from "@za38.03/agent-ui-runtime/ui";
import { useAgentRun } from "@za38.03/agent-ui-runtime";

export function ConversationThreadListPlugin(props: ComponentProps<typeof Implementation>) {
  const { snapshot, serviceAvailable } = useConversations();
  const { refresh } = useConversationActions();
  const theme = useAgentUITheme();
  const run = useAgentRun();
  return <Implementation snapshot={snapshot} serviceAvailable={serviceAvailable} onRefresh={refresh} theme={theme} runStatus={run.status} {...props} headerActions={props.renderSlot ? props.renderSlot("headerActions", props.headerActions ?? null) : props.headerActions} />;
}
