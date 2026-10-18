import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { ConversationLexicalEditComposer } from "./index";
import manifestJson from "./manifest.json";
export const conversationLexicalEditComposerPlugin = { manifest: parseUIPluginManifest(manifestJson), provides: [], inject: [], optionalInject: [], Component: ConversationLexicalEditComposer } satisfies UIPluginDefinition;
export default conversationLexicalEditComposerPlugin;
