import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
const AGENT_UI_LOCALE_SERVICE = "agent-ui.locale";
const AGENT_UI_CONVERSATION_SERVICE = "agent-ui.conversations";
import { ConversationHistoryPlugin } from "./index";
import manifestJson from "./manifest.json";

export const conversationHistoryPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  inject: [AGENT_UI_CONVERSATION_SERVICE],
  optionalInject: [AGENT_UI_LOCALE_SERVICE],
  Component: ConversationHistoryPlugin,
};
export default conversationHistoryPlugin;
