import { type UIPluginDefinition, parseUIPluginManifest } from '@za38.03/agent-ui-plugins/contracts';

import { AGENT_UI_LOCALE_SERVICE } from '@za38.03/agent-ui-runtime/ui/services/agent-ui-locale';
import { AGENT_UI_THEME_SERVICE } from '@za38.03/agent-ui-runtime/ui/services/agent-ui-theme';
import { AGENT_UI_CONVERSATION_SERVICE } from '../../services/conversations';
import { ConversationThreadListPlugin } from './index';
import manifestJson from './manifest.json';

export const conversationThreadListPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  inject: [AGENT_UI_CONVERSATION_SERVICE],
  optionalInject: [AGENT_UI_THEME_SERVICE, AGENT_UI_LOCALE_SERVICE],
  Component: ConversationThreadListPlugin,
};

export default conversationThreadListPlugin;
