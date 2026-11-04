import { type UIPluginDefinition, parseUIPluginManifest } from '@za38.03/agent-ui-plugins/contracts';

import { MockRunCiJobToolUI } from './index';
import manifestJson from './manifest.json';

const plugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  toolkit: { run_ci_job: { type: 'backend', display: 'standalone', render: MockRunCiJobToolUI } },
  Component: () => null,
};
export default plugin;
