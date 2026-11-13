import { createDefaultAgentUIPresentation } from "@za38.03/agent-ui-plugins";
import {
  AgentUIProjectProvider,
  createAgentUIProject,
} from '@za38.03/agent-ui-runtime/ui';
import '@za38.03/agent-ui-runtime/ui/styles.css';
import type { PropsWithChildren } from 'react';
import appUIModel from '../app-ui.json';
import revisionDescriptor from '../composition-revision.generated.json';
import { projectResources } from './resources.generated';
import { agentCompositionStore } from './composition-store';
import { development } from './environment';
import { capabilityCatalogRevision, pluginCapabilityCatalog } from '../plugins';
import '../styles.css';
import { ProjectShell } from './runtime-config.generated';
import { locales } from './locales';

export const agentUIProject = createAgentUIProject({
  ...projectResources,
  presentation: createDefaultAgentUIPresentation(),
  appUIModelSource: JSON.stringify(appUIModel),
  revisionDescriptorSource: revisionDescriptor === null ? undefined : JSON.stringify(revisionDescriptor),
  compositionStore: agentCompositionStore,
  pluginCapabilityCatalog,
  capabilityCatalogRevision,
  Shell: ProjectShell,
  locales,
  getConversationStarterSuggestions: (_locale, messages) => [
    { title: (messages.architectureTitle ?? ""), label: (messages.architectureLabel ?? ""), prompt: (messages.architecturePrompt ?? "") },
    { title: (messages.debugTitle ?? ""), label: (messages.debugLabel ?? ""), prompt: (messages.debugPrompt ?? "") },
    { title: (messages.nextTitle ?? ""), label: (messages.nextLabel ?? ""), prompt: (messages.nextPrompt ?? "") },
  ],
  development,
});

export function ProjectProvider({ children }: PropsWithChildren) {
  return <AgentUIProjectProvider value={agentUIProject}>{children}</AgentUIProjectProvider>;
}
