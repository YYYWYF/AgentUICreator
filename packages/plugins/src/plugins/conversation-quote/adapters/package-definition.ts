import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { ConversationQuotePlugin } from "./index";
const AGENT_UI_LOCALE_SERVICE = "agent-ui.locale";
import manifestJson from "./manifest.json";
export const conversationQuotePlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  optionalInject: [AGENT_UI_LOCALE_SERVICE], Component: ConversationQuotePlugin,
};
export default conversationQuotePlugin;
