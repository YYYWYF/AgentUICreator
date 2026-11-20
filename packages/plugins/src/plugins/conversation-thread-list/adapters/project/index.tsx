import { CanonicalConversationThreadList, CanonicalConversationThreadListRailAction } from '@za38.03/agent-ui-plugins';
import type { UIPluginComponentProps } from '@za38.03/agent-ui-plugins/contracts';
import { useTheme } from '@za38.03/agent-ui-runtime/ui';
import { useAgentRuntime } from '@za38.03/agent-ui-runtime/ui/runtime/context/index';
import { useConversations } from '../../services/hooks/useConversations';
import './styles.css';
export function ConversationThreadListPlugin(props: UIPluginComponentProps) {
  const { serviceAvailable, refresh } = useConversations();
  const snapshot = useConversations(state => state);
  const theme = useTheme();
  const runStatus = useAgentRuntime(snapshot => snapshot.run.status);
  return (
    <CanonicalConversationThreadList
      snapshot={snapshot}
      serviceAvailable={serviceAvailable}
      onRefresh={refresh}
      theme={theme}
      runStatus={runStatus}
      {...props}
    />
  );
}
export function ConversationThreadListRailAction(props: UIPluginComponentProps) {
  const { serviceAvailable } = useConversations();
  return <CanonicalConversationThreadListRailAction enabled={serviceAvailable} {...props} />;
}
