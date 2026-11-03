import { parseUIPluginManifest, type UIPluginDefinition } from "@za38.03/agent-ui-plugins/contracts";
import { ConversationAddAttachmentActionPlugin } from "./index";
import manifestJson from "./manifest.json";

export const conversationAddAttachmentActionPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: ConversationAddAttachmentActionPlugin,
};

export default conversationAddAttachmentActionPlugin;
