import { AgentIdentityPlugin as Implementation } from '@za38.03/agent-ui-plugins/agent-identity';
import type { ComponentProps } from 'react';

export function AgentIdentityPlugin(props: ComponentProps<typeof Implementation>) {
  return <Implementation {...props} />;
}
