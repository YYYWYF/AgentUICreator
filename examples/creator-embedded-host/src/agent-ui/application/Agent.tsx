import { AgentApplication, type AgentProps } from '@za38.03/agent-ui-runtime/ui';
import { agentUIProject } from './project-config';
export type { AgentProps } from '@za38.03/agent-ui-runtime/ui';

export function Agent(props: AgentProps = {}) {
  return <AgentApplication project={agentUIProject} {...props} />;
}
