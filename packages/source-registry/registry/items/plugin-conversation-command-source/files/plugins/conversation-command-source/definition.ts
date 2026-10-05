import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { CONVERSATION_COMMAND_SOURCE, createConversationCommandRegistry } from "../../services/composer-triggers";
import { ConversationCommandSourcePlugin } from "./index";
import manifestJson from "./manifest.json";
export const conversationCommandSourcePlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson), provides: [CONVERSATION_COMMAND_SOURCE],
  setup: ({ services }) => { services.provide(CONVERSATION_COMMAND_SOURCE, createConversationCommandRegistry()); },
  Component: ConversationCommandSourcePlugin,
};
export default conversationCommandSourcePlugin;
