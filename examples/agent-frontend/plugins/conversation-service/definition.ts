import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import {
  AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE,
  AGENT_UI_CONVERSATION_SERVICE,
  createConversationService,
} from "../../services/conversations";
import { ConversationServicePlugin } from "./index";
import manifestJson from "./manifest.json";

export const conversationServicePlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  inject: [AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE],
  provides: [AGENT_UI_CONVERSATION_SERVICE],
  setup: ({ services }) => {
    const dataSource = services.get(
      AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE,
    );
    if (dataSource === undefined) {
      throw new Error("Conversation DataSource is unavailable.");
    }
    const service = createConversationService({
      dataSource,
    });
    services.provide(AGENT_UI_CONVERSATION_SERVICE, service);
    void service.refresh();
    return () => {
      service.dispose();
    };
  },
  Component: ConversationServicePlugin,
};

export default conversationServicePlugin;
