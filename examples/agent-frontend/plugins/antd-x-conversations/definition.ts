import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AGENT_UI_CONVERSATION_SERVICE } from "../../services/conversations";
import { AntdXConversationsPlugin } from "./index";
import manifestJson from "./manifest.json";
import { createAgentUIConversationService } from "./conversation-service";

export const antdXConversationsPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  setup: ({ instance, services }) => {
    services.provide(
      AGENT_UI_CONVERSATION_SERVICE,
      createAgentUIConversationService(instance.props?.activeKey),
    );
  },
  Component: AntdXConversationsPlugin,
};
