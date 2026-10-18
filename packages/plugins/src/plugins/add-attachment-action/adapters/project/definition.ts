import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { ConversationAddAttachmentActionPlugin } from "./index";
import manifestJson from "./manifest.json";

export const conversationAddAttachmentActionPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: ConversationAddAttachmentActionPlugin,
};

export default conversationAddAttachmentActionPlugin;
