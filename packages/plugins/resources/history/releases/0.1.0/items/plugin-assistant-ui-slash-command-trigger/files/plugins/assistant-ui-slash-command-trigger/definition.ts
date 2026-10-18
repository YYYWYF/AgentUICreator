import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { CONVERSATION_COMMAND_SOURCE } from "../../services/composer-triggers";
import { AssistantUiSlashCommandTrigger } from "./index";
import manifestJson from "./manifest.json";
export const assistantUiSlashCommandTriggerPlugin: UIPluginDefinition = { manifest: parseUIPluginManifest(manifestJson), optionalInject: [CONVERSATION_COMMAND_SOURCE], Component: AssistantUiSlashCommandTrigger };
export default assistantUiSlashCommandTriggerPlugin;
