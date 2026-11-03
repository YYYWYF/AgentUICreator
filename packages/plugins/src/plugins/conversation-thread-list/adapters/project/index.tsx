import { useConversationActions } from "../../services/hooks/useConversationActions";
import { useConversations } from "../../services/hooks/useConversations";
import { CanonicalConversationThreadList, CanonicalConversationThreadListRailAction } from "@za38.03/agent-ui-plugins";
import type { UIPluginComponentProps } from "@za38.03/agent-ui-plugins/contracts";
import { useAgentUITheme } from "@za38.03/agent-ui-runtime/ui";
import { useAgentRun } from "@za38.03/agent-ui-runtime/ui/runtime/context/index";
import "./styles.css";
export function ConversationThreadListPlugin(props: UIPluginComponentProps) {
  const { snapshot, serviceAvailable } = useConversations();
  const { refresh } = useConversationActions();
  const theme = useAgentUITheme(); const run = useAgentRun();
  return <CanonicalConversationThreadList snapshot={snapshot} serviceAvailable={serviceAvailable} onRefresh={refresh} theme={theme} runStatus={run.status} {...props} />;
}
export function ConversationThreadListRailAction(props: UIPluginComponentProps) {
  const { serviceAvailable } = useConversations();
  return <CanonicalConversationThreadListRailAction enabled={serviceAvailable} {...props} />;
}
