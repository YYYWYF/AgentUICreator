import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { CONVERSATION_MENTION_SOURCE } from "../../services/composer-triggers";
import { AssistantUiMentionTrigger } from "./index";
import manifestJson from "./manifest.json";
export const assistantUiMentionTriggerPlugin: UIPluginDefinition = { manifest: parseUIPluginManifest(manifestJson), optionalInject: [CONVERSATION_MENTION_SOURCE], Component: AssistantUiMentionTrigger };
export default assistantUiMentionTriggerPlugin;
