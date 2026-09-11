import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import {
  AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE,
  AGENT_UI_CONVERSATION_SERVICE,
  createConversationController,
} from "../../services/conversations";
import { ConversationControllerPlugin } from "./index";
import manifestJson from "./manifest.json";

export const conversationControllerPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  inject: [AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE],
  provides: [AGENT_UI_CONVERSATION_SERVICE],
  setup: ({ actions, services }) => {
    const dataSource = services.get(
      AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE,
    );
    if (dataSource === undefined) {
      throw new Error("Conversation DataSource is unavailable.");
    }
    const controller = createConversationController({
      dataSource,
      startNewConversation: actions.startNewConversation,
    });
    services.provide(AGENT_UI_CONVERSATION_SERVICE, controller);
    void controller.refresh();
    return () => {
      controller.dispose();
    };
  },
  Component: ConversationControllerPlugin,
};

export default conversationControllerPlugin;
