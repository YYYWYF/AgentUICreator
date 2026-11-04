import { CanonicalConversationSurfacePlugin, type ConversationSurfacePluginProps } from '@za38.03/agent-ui-plugins';
import './styles.css';
export function ConversationSurfacePlugin(props: ConversationSurfacePluginProps) {
  return <CanonicalConversationSurfacePlugin {...props} />;
}
