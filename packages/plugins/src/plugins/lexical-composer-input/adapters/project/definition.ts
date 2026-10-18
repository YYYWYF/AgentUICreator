import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { ConversationLexicalComposerInput } from "./index";
import manifestJson from "./manifest.json";

export const conversationLexicalComposerInputPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: ConversationLexicalComposerInput,
};
export default conversationLexicalComposerInputPlugin;
