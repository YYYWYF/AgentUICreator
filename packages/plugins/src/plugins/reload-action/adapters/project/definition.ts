import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { ConversationReloadActionPlugin } from "./index";
import manifestJson from "./manifest.json";

export const conversationReloadActionPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: ConversationReloadActionPlugin,
};

export default conversationReloadActionPlugin;
