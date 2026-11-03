import { parseUIPluginManifest, type UIPluginDefinition } from "@za38.03/agent-ui-plugins/contracts";
import { ConversationToolTimelinePlugin } from "./index";
import manifestJson from "./manifest.json";
export const conversationToolTimelinePlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson), Component: ConversationToolTimelinePlugin,
};
export default conversationToolTimelinePlugin;
