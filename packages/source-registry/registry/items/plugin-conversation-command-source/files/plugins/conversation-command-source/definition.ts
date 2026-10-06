import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { CONVERSATION_COMMAND_SOURCE, createConversationCommandRegistry } from "../../services/composer-triggers";
import { ConversationCommandSourcePlugin } from "./index";
import { AGENT_UI_LOCALE_SERVICE } from "../../services/agent-ui-locale";
import manifestJson from "./manifest.json";
export const conversationCommandSourcePlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson), provides: [CONVERSATION_COMMAND_SOURCE],
  setup: ({ services }) => { services.provide(CONVERSATION_COMMAND_SOURCE, createConversationCommandRegistry()); },
  optionalInject: [AGENT_UI_LOCALE_SERVICE], Component: ConversationCommandSourcePlugin,
};
export default conversationCommandSourcePlugin;
