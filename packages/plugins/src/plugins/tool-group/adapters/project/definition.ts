import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { ConversationToolGroupPlugin } from "./index";
import manifestJson from "./manifest.json";

export const conversationToolGroupPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: ConversationToolGroupPlugin,
};

export default conversationToolGroupPlugin;
