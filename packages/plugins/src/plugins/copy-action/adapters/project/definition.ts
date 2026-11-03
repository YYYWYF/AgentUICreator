import { parseUIPluginManifest, type UIPluginDefinition } from "@za38.03/agent-ui-plugins/contracts";
import { ConversationCopyActionPlugin } from "./index";
import manifestJson from "./manifest.json";

export const conversationCopyActionPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: ConversationCopyActionPlugin,
};

export default conversationCopyActionPlugin;
