import { CanonicalAgentIdentityPlugin, type AgentIdentityPluginProps } from '@za38.03/agent-ui-plugins';
import './styles.css';
export function AgentIdentityPlugin(props: AgentIdentityPluginProps) {
  return <CanonicalAgentIdentityPlugin {...props} />;
}
