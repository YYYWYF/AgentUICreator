import { parseUIPluginManifest, type UIPluginDefinition } from '@za38.03/agent-ui-plugins/contracts';
import manifest from './manifest.json';
import { ProjectWorkspacePlugin } from './index';

const definition: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifest),
  inject: ['agent-ui.stack-navigation'],
  Component: ProjectWorkspacePlugin,
};

export default definition;
