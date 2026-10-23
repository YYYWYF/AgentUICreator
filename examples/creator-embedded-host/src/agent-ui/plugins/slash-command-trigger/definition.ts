import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import implementation from "@za38.03/agent-ui-plugins/slash-command-trigger";
import { ConversationSlashCommandTrigger } from "./index";
const definition: UIPluginDefinition = { manifest: implementation.manifest, provides: [], inject: [], optionalInject: ["agent-ui.locale", "conversation.slash-command-source"], Component: ConversationSlashCommandTrigger };
export default definition;
