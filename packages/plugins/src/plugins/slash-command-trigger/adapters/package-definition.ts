import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { ConversationSlashCommandTrigger } from "./index";
import manifestJson from "./manifest.json";
export const conversationSlashCommandTriggerPlugin = { manifest: parseUIPluginManifest(manifestJson), provides: [], inject: [], optionalInject: ["agent-ui.locale", "conversation.slash-command-source"], Component: ConversationSlashCommandTrigger } satisfies UIPluginDefinition;
export default conversationSlashCommandTriggerPlugin;
