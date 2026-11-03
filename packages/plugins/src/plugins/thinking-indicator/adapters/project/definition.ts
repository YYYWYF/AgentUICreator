import { parseUIPluginManifest, type UIPluginDefinition } from "@za38.03/agent-ui-plugins/contracts";
import { ConversationThinkingIndicatorPlugin } from "./index";
import manifestJson from "./manifest.json";
export const conversationThinkingIndicatorPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson), Component: ConversationThinkingIndicatorPlugin,
};
export default conversationThinkingIndicatorPlugin;
