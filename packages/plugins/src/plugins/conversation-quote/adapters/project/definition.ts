import { parseUIPluginManifest, type UIPluginDefinition } from "@za38.03/agent-ui-plugins/contracts";
import { ConversationQuotePlugin } from "./index";
import { AGENT_UI_LOCALE_SERVICE } from "@za38.03/agent-ui-runtime/ui/services/agent-ui-locale";
import manifestJson from "./manifest.json";
export const conversationQuotePlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  optionalInject: [AGENT_UI_LOCALE_SERVICE], Component: ConversationQuotePlugin,
};
export default conversationQuotePlugin;
