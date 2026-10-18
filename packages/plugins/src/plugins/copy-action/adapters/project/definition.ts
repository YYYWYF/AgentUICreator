import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { ConversationCopyActionPlugin } from "./index";
import manifestJson from "./manifest.json";

export const conversationCopyActionPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: ConversationCopyActionPlugin,
};

export default conversationCopyActionPlugin;
