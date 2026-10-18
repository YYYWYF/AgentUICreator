import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { ConversationToolFallbackPlugin } from "./index";
import manifestJson from "./manifest.json";

export const conversationToolFallbackPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: ConversationToolFallbackPlugin,
};

export default conversationToolFallbackPlugin;
