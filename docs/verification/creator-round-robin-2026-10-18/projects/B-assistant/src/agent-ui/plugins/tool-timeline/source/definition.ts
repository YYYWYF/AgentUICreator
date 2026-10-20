import { parseUIPluginManifest, type UIPluginDefinition } from "../../../framework/contracts/ui-plugin";
import { ConversationToolTimelinePlugin } from "./index";
import manifestJson from "./manifest.json";
export const conversationToolTimelinePlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson), Component: ConversationToolTimelinePlugin,
};
export default conversationToolTimelinePlugin;
