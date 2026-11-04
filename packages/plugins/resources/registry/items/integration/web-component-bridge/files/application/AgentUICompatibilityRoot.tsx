import { AgentUICompatibilityRoot as CompatibilityRoot } from '@za38.03/agent-ui-runtime/ui';
import type { ComponentProps } from 'react';
import { ProjectProvider } from './project-config';
export function AgentUICompatibilityRoot(props: ComponentProps<typeof CompatibilityRoot>) {
  return (
    <ProjectProvider>
      <CompatibilityRoot {...props} />
    </ProjectProvider>
  );
}
