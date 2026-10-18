import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { AGENT_UI_LOCALE_SERVICE } from "../../services/agent-ui-locale";
import { AGENT_UI_CONVERSATION_SERVICE } from "../../services/conversations";
import { ConversationHistoryPlugin } from "./index";
import manifestJson from "./manifest.json";

export const conversationHistoryPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  inject: [AGENT_UI_CONVERSATION_SERVICE],
  optionalInject: [AGENT_UI_LOCALE_SERVICE],
  Component: ConversationHistoryPlugin,
};
export default conversationHistoryPlugin;
