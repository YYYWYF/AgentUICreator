import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { ConversationDictationActionPlugin } from "./index";
import manifestJson from "./manifest.json";

export const conversationDictationActionPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: ConversationDictationActionPlugin,
};

export default conversationDictationActionPlugin;
