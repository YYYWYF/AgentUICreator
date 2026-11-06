import {
  AgentUIProjectProvider,
  createAgentUIProject,
  resolveAgentUIProjectResources,
} from '@za38.03/agent-ui-runtime/ui';
import '@za38.03/agent-ui-runtime/ui/styles.css';
import type { PropsWithChildren } from 'react';
import appUIModelSource from '../app-ui.json?raw';
import { capabilityCatalogRevision, pluginCapabilityCatalog } from '../plugins';
import '../styles.css';
import { ProjectShell } from './runtime-config.generated';
import { locales } from './locales';

const revisions = import.meta.glob<string>('../composition-revision.generated.json', {
  eager: true,
  query: '?raw',
  import: 'default',
});
const resources = import.meta.glob(
  [
    '../agent-contract/frontend-tools.generated.ts',
    '../agent-ui/conversation/frontend-tool-uis.generated.ts',
    '../agent-ui/conversation/integrations.generated.tsx',
  ],
  { eager: true },
);
export const agentUIProject = createAgentUIProject({
  ...resolveAgentUIProjectResources(resources),
  appUIModelSource,
  revisionDescriptorSource: revisions['../composition-revision.generated.json'],
  pluginCapabilityCatalog,
  capabilityCatalogRevision,
  Shell: ProjectShell,
  locales,
  getConversationStarterSuggestions: (_locale, messages) => [
    { title: messages.architectureTitle, label: messages.architectureLabel, prompt: messages.architecturePrompt },
    { title: messages.debugTitle, label: messages.debugLabel, prompt: messages.debugPrompt },
    { title: messages.nextTitle, label: messages.nextLabel, prompt: messages.nextPrompt },
  ],
  development: import.meta.env.DEV,
  hot: import.meta.hot,
});

export function ProjectProvider({ children }: PropsWithChildren) {
  return <AgentUIProjectProvider value={agentUIProject}>{children}</AgentUIProjectProvider>;
}
