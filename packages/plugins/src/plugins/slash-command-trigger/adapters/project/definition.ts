import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { CONVERSATION_COMMAND_SOURCE } from "../../services/composer-triggers";
import { ConversationSlashCommandTrigger } from "./index";
import { AGENT_UI_LOCALE_SERVICE } from "../../services/agent-ui-locale";
import manifestJson from "./manifest.json";
export const conversationSlashCommandTriggerPlugin: UIPluginDefinition = { manifest: parseUIPluginManifest(manifestJson), optionalInject: [AGENT_UI_LOCALE_SERVICE, CONVERSATION_COMMAND_SOURCE], Component: ConversationSlashCommandTrigger };
export default conversationSlashCommandTriggerPlugin;
