import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
const AGENT_UI_LOCALE_SERVICE = "agent-ui.locale";
const AGENT_UI_THEME_SERVICE = "agent-ui.theme";
const AGENT_UI_CONVERSATION_SERVICE = "agent-ui.conversations";
import { ConversationThreadListPlugin } from "./index";
import manifestJson from "./manifest.json";

export const conversationThreadListPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  inject: [AGENT_UI_CONVERSATION_SERVICE],
  optionalInject: [AGENT_UI_THEME_SERVICE, AGENT_UI_LOCALE_SERVICE],
  Component: ConversationThreadListPlugin,
};

export default conversationThreadListPlugin;

export { ConversationThreadListRailAction } from "./index";
