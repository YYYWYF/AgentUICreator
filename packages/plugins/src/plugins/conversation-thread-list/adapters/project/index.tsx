import { CanonicalConversationThreadList, CanonicalConversationThreadListRailAction } from "@za38.03/agent-ui-plugins";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { useAgentUITheme } from "../../agent-ui/theme/useAgentUITheme";
import { useAgentRun } from "../../runtime/context";
import { usePluginService, usePluginServiceSnapshot } from "../../runtime/plugins";
import { AGENT_UI_CONVERSATION_SERVICE, EMPTY_CONVERSATION_SNAPSHOT, type ConversationService } from "../../services/conversations";
import "./styles.css";
export function ConversationThreadListPlugin(props: UIPluginComponentProps) {
  const conversation = usePluginService<ConversationService>(AGENT_UI_CONVERSATION_SERVICE);
  const snapshot = usePluginServiceSnapshot(conversation, EMPTY_CONVERSATION_SNAPSHOT);
  const theme = useAgentUITheme(); const run = useAgentRun();
  return <CanonicalConversationThreadList snapshot={snapshot} serviceAvailable={conversation !== undefined} onRefresh={() => conversation?.refresh()} theme={theme} runStatus={run.status} {...props} />;
}
export function ConversationThreadListRailAction(props: UIPluginComponentProps) {
  const conversation = usePluginService<ConversationService>(AGENT_UI_CONVERSATION_SERVICE);
  return <CanonicalConversationThreadListRailAction enabled={conversation !== undefined} {...props} />;
}
