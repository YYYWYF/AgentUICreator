import { parseUIPluginManifest, type UIPluginDefinition } from '@za38.03/agent-ui-plugins/contracts';
import { AGENT_UI_LOCALE_SERVICE } from '@za38.03/agent-ui-runtime/ui/services/agent-ui-locale';
import { ConversationExportMarkdownActionPlugin } from './index';
import manifestJson from './manifest.json';

export const conversationExportMarkdownActionPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  optionalInject: [AGENT_UI_LOCALE_SERVICE],
  Component: ConversationExportMarkdownActionPlugin,
};

export default conversationExportMarkdownActionPlugin;
