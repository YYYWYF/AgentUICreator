import { CanonicalAgentStatusMessage, type AgentStatusMessageProps } from "@za38.03/agent-ui-plugins";
/** Compatibility entry; the maintained message implementation has one owner. */
export function MockAgentStatusToolUI(props: AgentStatusMessageProps) {
  return <CanonicalAgentStatusMessage {...props} />;
}
