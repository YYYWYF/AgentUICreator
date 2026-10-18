import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { CONVERSATION_MENTION_SOURCE } from "../../services/composer-triggers";
import { ConversationMentionTrigger } from "./index";
import { AGENT_UI_LOCALE_SERVICE } from "../../services/agent-ui-locale";
import manifestJson from "./manifest.json";
export const conversationMentionTriggerPlugin: UIPluginDefinition = { manifest: parseUIPluginManifest(manifestJson), optionalInject: [AGENT_UI_LOCALE_SERVICE, CONVERSATION_MENTION_SOURCE], Component: ConversationMentionTrigger };
export default conversationMentionTriggerPlugin;
