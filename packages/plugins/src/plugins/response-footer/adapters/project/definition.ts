import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { ConversationResponseFooterPlugin } from "./index";
import manifestJson from "./manifest.json";

export const conversationResponseFooterPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: ConversationResponseFooterPlugin,
};

export default conversationResponseFooterPlugin;
