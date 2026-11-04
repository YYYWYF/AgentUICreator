import { parseUIPluginManifest, type UIPluginDefinition } from '@za38.03/agent-ui-plugins/contracts';
import { AGENT_UI_LOCALE_SERVICE } from '@za38.03/agent-ui-runtime/ui/services/agent-ui-locale';
import { CONVERSATION_MENTION_SOURCE } from '../../services/composer-triggers';
import { ConversationMentionTrigger } from './index';
import manifestJson from './manifest.json';
export const conversationMentionTriggerPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  optionalInject: [AGENT_UI_LOCALE_SERVICE, CONVERSATION_MENTION_SOURCE],
  Component: ConversationMentionTrigger,
};
export default conversationMentionTriggerPlugin;
