import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { ConversationReasoningPlugin } from "./index";
import manifestJson from "./manifest.json";

export const conversationReasoningPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: ConversationReasoningPlugin,
};

export default conversationReasoningPlugin;
