import { CanonicalConversationNew, type ConversationNewPluginProps } from '@za38.03/agent-ui-plugins';
import './styles.css';
export function ConversationNewPlugin(props: ConversationNewPluginProps) {
  return <CanonicalConversationNew {...props} />;
}
