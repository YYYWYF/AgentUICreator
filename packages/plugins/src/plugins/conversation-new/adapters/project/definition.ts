import { parseUIPluginManifest, type UIPluginDefinition } from "@za38.03/agent-ui-plugins/contracts";
import { ConversationNewPlugin } from "./index";
import manifestJson from "./manifest.json";

export const conversationNewPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: ConversationNewPlugin,
};
export default conversationNewPlugin;
