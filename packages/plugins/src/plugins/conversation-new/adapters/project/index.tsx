import { CanonicalConversationNew } from '@za38.03/agent-ui-plugins';
import type { UIPluginComponentProps } from '@za38.03/agent-ui-plugins/contracts';
import './styles.css';
export function ConversationNewPlugin(props: UIPluginComponentProps) {
  return <CanonicalConversationNew {...props} />;
}
