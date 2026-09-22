import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import {
  AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE,
  createEmptyConversationDataSource,
  createHttpConversationDataSource,
  resolveConversationDataEndpoint,
} from "../../services/conversations";
import { ConversationDataSourcePlugin } from "./index";
import manifestJson from "./manifest.json";

export const conversationDataSourcePlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  provides: [AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE],
  setup: ({ services }) => {
    const endpoint = resolveConversationDataEndpoint({
      configuredEndpoint: import.meta.env.VITE_CONVERSATION_API_ENDPOINT,
      dataMode: import.meta.env.VITE_CONVERSATION_DATA_MODE,
      isDev: import.meta.env.DEV,
    });
    const source = endpoint === undefined
      ? createEmptyConversationDataSource()
      : createHttpConversationDataSource({ endpoint });
    services.provide(AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE, source);
  },
  Component: ConversationDataSourcePlugin,
};

export default conversationDataSourcePlugin;
