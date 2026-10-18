import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { ConversationLexicalComposerInput } from "./index";
import manifestJson from "./manifest.json";
export const conversationLexicalComposerInputPlugin = { manifest: parseUIPluginManifest(manifestJson), provides: [], inject: [], optionalInject: [], Component: ConversationLexicalComposerInput } satisfies UIPluginDefinition;
export default conversationLexicalComposerInputPlugin;
