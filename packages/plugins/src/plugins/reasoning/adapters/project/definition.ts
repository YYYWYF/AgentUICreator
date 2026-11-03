import { parseUIPluginManifest, type UIPluginDefinition } from "@za38.03/agent-ui-plugins/contracts";
import { ConversationReasoningPlugin } from "./index";
import manifestJson from "./manifest.json";

export const conversationReasoningPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: ConversationReasoningPlugin,
};

export default conversationReasoningPlugin;
