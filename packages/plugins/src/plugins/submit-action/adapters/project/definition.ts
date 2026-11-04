import { parseUIPluginManifest, type UIPluginDefinition } from '@za38.03/agent-ui-plugins/contracts';
import { AGENT_UI_LOCALE_SERVICE } from '@za38.03/agent-ui-runtime/ui/services/agent-ui-locale';
import { ConversationSubmitActionPlugin } from './index';
import manifestJson from './manifest.json';

export const conversationSubmitActionPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  optionalInject: [AGENT_UI_LOCALE_SERVICE],
  Component: ConversationSubmitActionPlugin,
};

export default conversationSubmitActionPlugin;
