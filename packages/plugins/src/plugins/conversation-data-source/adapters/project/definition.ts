import { getPreviewAgentEnvironment } from "@za38.03/agent-ui-runtime/ui/application/preview-environment";
import { createAgentBackendTransport } from "@za38.03/agent-ui-runtime/ui/application/agent-backend-transport";
import type { UIPluginDefinition } from "@za38.03/agent-ui-plugins/contracts";
import { parseUIPluginManifest } from "@za38.03/agent-ui-plugins/contracts";
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
      configuredEndpoint: getPreviewAgentEnvironment(import.meta.env.DEV)?.conversationDataEndpointOverride,
    });
    const source = endpoint === undefined
      ? createEmptyConversationDataSource()
      : createHttpConversationDataSource({ endpoint, fetch: createAgentBackendTransport({ development: import.meta.env.DEV }).fetch });
    services.provide(AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE, source);
  },
  Component: ConversationDataSourcePlugin,
};

export default conversationDataSourcePlugin;
