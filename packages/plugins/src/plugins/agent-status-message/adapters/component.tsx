import { CanonicalAgentStatusMessage, type AgentStatusMessageProps } from "@za38.03/agent-ui-plugins";
export function AgentStatusMessagePlugin(props: AgentStatusMessageProps) {
  return <CanonicalAgentStatusMessage {...props} />;
}
