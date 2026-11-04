import {
  CanonicalConversationThreadList,
  CanonicalConversationThreadListRailAction,
  type ConversationThreadListPluginProps,
  type ConversationThreadListRailActionProps,
} from '@za38.03/agent-ui-plugins';
import './styles.css';
export function ConversationThreadListPlugin(props: ConversationThreadListPluginProps) {
  return <CanonicalConversationThreadList {...props} />;
}
export function ConversationThreadListRailAction(props: ConversationThreadListRailActionProps) {
  return <CanonicalConversationThreadListRailAction {...props} />;
}
