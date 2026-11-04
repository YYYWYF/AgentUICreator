import { type UIPluginDefinition, parseUIPluginManifest } from '@za38.03/agent-ui-plugins/contracts';

import { GenerateFileToolUI } from './index';
import manifestJson from './manifest.json';

const plugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  toolkit: { generate_file: { type: 'backend', display: 'standalone', render: GenerateFileToolUI } },
  Component: () => null,
};
export default plugin;
