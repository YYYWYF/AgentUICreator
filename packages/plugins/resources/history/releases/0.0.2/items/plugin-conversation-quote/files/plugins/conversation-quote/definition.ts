import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { ConversationQuotePlugin } from "./index";
import manifestJson from "./manifest.json";
export const conversationQuotePlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: ConversationQuotePlugin,
};
export default conversationQuotePlugin;
