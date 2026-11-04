import { parseUIPluginManifest, type UIPluginDefinition } from '@za38.03/agent-ui-plugins/contracts';
import { AGENT_UI_LOCALE_SERVICE } from '@za38.03/agent-ui-runtime/ui/services/agent-ui-locale';
import { CONVERSATION_COMMAND_SOURCE } from '../../services/composer-triggers';
import { ConversationSlashCommandTrigger } from './index';
import manifestJson from './manifest.json';
export const conversationSlashCommandTriggerPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  optionalInject: [AGENT_UI_LOCALE_SERVICE, CONVERSATION_COMMAND_SOURCE],
  Component: ConversationSlashCommandTrigger,
};
export default conversationSlashCommandTriggerPlugin;
