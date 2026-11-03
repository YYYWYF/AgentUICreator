import { parseUIPluginManifest, type UIPluginDefinition } from "@za38.03/agent-ui-plugins/contracts";
import { ConversationLexicalComposerInput } from "./index";
import manifestJson from "./manifest.json";

export const conversationLexicalComposerInputPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: ConversationLexicalComposerInput,
};
export default conversationLexicalComposerInputPlugin;
