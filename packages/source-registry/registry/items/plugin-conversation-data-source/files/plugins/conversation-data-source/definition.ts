import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import {
  AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE,
  createEmptyConversationDataSource,
  createHttpConversationDataSource,
  resolveConversationDataEndpoint,
} from "../../services/conversations";
import { ConversationDataSourcePlugin } from "./index";
import { conversationDataEndpoint } from "../../agent-ui/conversation/config/conversation-runtime-config";
import manifestJson from "./manifest.json";

export const conversationDataSourcePlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  provides: [AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE],
  setup: ({ services }) => {
    const endpoint = resolveConversationDataEndpoint({
      configuredEndpoint: conversationDataEndpoint,
    });
    const source = endpoint === undefined
      ? createEmptyConversationDataSource()
      : createHttpConversationDataSource({ endpoint });
    services.provide(AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE, source);
  },
  Component: ConversationDataSourcePlugin,
};

export default conversationDataSourcePlugin;
