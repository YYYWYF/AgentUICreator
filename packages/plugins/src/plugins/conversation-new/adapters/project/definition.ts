import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { ConversationNewPlugin } from "./index";
import manifestJson from "./manifest.json";

export const conversationNewPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: ConversationNewPlugin,
};
export default conversationNewPlugin;
