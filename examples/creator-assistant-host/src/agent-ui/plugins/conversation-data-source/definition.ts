import type { UIPluginDefinition } from '@za38.03/agent-ui-plugins';
import implementation from '@za38.03/agent-ui-plugins/conversation-data-source';
import { createAgentBackendTransport } from '@za38.03/agent-ui-runtime/ui/application/agent-backend-transport';
import { getPreviewAgentEnvironment } from '@za38.03/agent-ui-runtime/ui/application/preview-environment';

import {
  AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE,
  createEmptyConversationDataSource,
  createHttpConversationDataSource,
  resolveConversationDataEndpoint,
} from '../../services/conversations';
import { ConversationDataSourcePlugin } from './index';

// Build-time convention shared by Vite, Webpack/CRA and Rsbuild.
declare const process: { env: { NODE_ENV?: string } };
const development = process.env.NODE_ENV === 'development';

export const conversationDataSourcePlugin: UIPluginDefinition = {
  manifest: implementation.manifest,
  provides: [AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE],
  setup: implementation.bindSetup(({ services }: Parameters<NonNullable<UIPluginDefinition['setup']>>[0]) => {
    const endpoint = resolveConversationDataEndpoint({
      configuredEndpoint: getPreviewAgentEnvironment(development)?.conversationDataEndpointOverride,
    });
    const source =
      endpoint === undefined
        ? createEmptyConversationDataSource()
        : createHttpConversationDataSource({
            endpoint,
            fetch: createAgentBackendTransport({ development: development }).fetch,
          });
    services.provide(AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE, source);
  }),
  Component: ConversationDataSourcePlugin,
};

export default conversationDataSourcePlugin;
