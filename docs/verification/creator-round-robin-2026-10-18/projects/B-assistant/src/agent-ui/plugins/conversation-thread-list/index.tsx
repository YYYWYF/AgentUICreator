import { ConversationThreadListPlugin as Implementation, ConversationThreadListRailAction as RailImplementation } from "@za38.03/agent-ui-plugins/conversation-thread-list";
import type { ComponentProps } from "react";
import { usePluginService, usePluginServiceSnapshot } from "../../runtime/plugins";
import { AGENT_UI_CONVERSATION_SERVICE, EMPTY_CONVERSATION_SNAPSHOT, type ConversationService } from "../../services/conversations";
import { useAgentUITheme } from "../../agent-ui/theme/useAgentUITheme";
import { useAgentRun } from "../../runtime/context";

export function ConversationThreadListPlugin(props: ComponentProps<typeof Implementation>) {
  const conversation = usePluginService<ConversationService>(AGENT_UI_CONVERSATION_SERVICE);
  const snapshot = usePluginServiceSnapshot(conversation, EMPTY_CONVERSATION_SNAPSHOT);
  const theme = useAgentUITheme();
  const run = useAgentRun();
  return <Implementation snapshot={snapshot} serviceAvailable={conversation !== undefined} onRefresh={() => conversation?.refresh()} theme={theme} runStatus={run.status} {...props} />;
}

export function ConversationThreadListRailAction(props: ComponentProps<typeof RailImplementation>) {
  const conversation = usePluginService<ConversationService>(AGENT_UI_CONVERSATION_SERVICE);
  return <RailImplementation enabled={conversation !== undefined} {...props} />;
}
