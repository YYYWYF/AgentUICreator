import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import {
  AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE,
  AGENT_UI_CONVERSATION_SERVICE,
  createConversationController,
} from "../../services/conversations";
import { AntdXConversationsPlugin } from "./index";
import { bindConversationController } from "./controller-store";
import manifestJson from "./manifest.json";

export const antdXConversationsPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  inject: [AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE],
  provides: [AGENT_UI_CONVERSATION_SERVICE],
  setup: ({ actions, instance, services }) => {
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
    services.provide(
      AGENT_UI_CONVERSATION_SERVICE,
      controller,
    );
    const unbindController = bindConversationController(
      instance.id,
      controller,
    );
    void controller.refresh();
    return () => {
      unbindController();
      controller.dispose();
    };
  },
  Component: AntdXConversationsPlugin,
};

export default antdXConversationsPlugin;
