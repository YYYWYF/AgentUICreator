import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { ConversationThinkingIndicatorPlugin } from "./index";
import manifestJson from "./manifest.json";
export const conversationThinkingIndicatorPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson), Component: ConversationThinkingIndicatorPlugin,
};
export default conversationThinkingIndicatorPlugin;
