import { type UIPluginDefinition, parseUIPluginManifest } from '@za38.03/agent-ui-plugins/contracts';

import { AGENT_UI_LOCALE_SERVICE } from '@za38.03/agent-ui-runtime/ui/services/agent-ui-locale';
import { AgentIdentityPlugin } from './index';
import manifestJson from './manifest.json';
export const agentIdentityPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  optionalInject: [AGENT_UI_LOCALE_SERVICE],
  Component: AgentIdentityPlugin,
};
export default agentIdentityPlugin;
