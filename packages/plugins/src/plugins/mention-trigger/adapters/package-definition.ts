import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { ConversationMentionTrigger } from "./index";
import manifestJson from "./manifest.json";
export const conversationMentionTriggerPlugin = { manifest: parseUIPluginManifest(manifestJson), provides: [], inject: [], optionalInject: ["agent-ui.locale", "conversation.mention-source"], Component: ConversationMentionTrigger } satisfies UIPluginDefinition;
export default conversationMentionTriggerPlugin;
