import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { ConversationLexicalEditComposer } from "./index";
import manifestJson from "./manifest.json";

export const conversationLexicalEditComposerPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: ConversationLexicalEditComposer,
};
export default conversationLexicalEditComposerPlugin;
