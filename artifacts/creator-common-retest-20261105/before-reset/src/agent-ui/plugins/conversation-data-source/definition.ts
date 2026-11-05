import type { UIPluginDefinition } from '@za38.03/agent-ui-plugins';
import implementation from '@za38.03/agent-ui-plugins/conversation-data-source';
import { createAgentBackendTransport } from '@za38.03/agent-ui-runtime/ui/application/agent-backend-transport';
import { getPreviewAgentEnvironment } from '@za38.03/agent-ui-runtime/ui/application/preview-environment';

import {
  AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE,
  createHttpConversationDataSource,
  resolveConversationDataEndpoint,
} from '../../services/conversations';
import { ConversationDataSourcePlugin } from './index';

export const conversationDataSourcePlugin: UIPluginDefinition = {
  manifest: implementation.manifest,
  provides: [AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE],
  setup: implementation.bindSetup(({ services }: Parameters<NonNullable<UIPluginDefinition['setup']>>[0]) => {
    // 历史接口与 Agent 后端同域：请求经 Agent 后端传送器发出，不额外配置数据源或鉴权头。
    const endpoint = resolveConversationDataEndpoint({
      configuredEndpoint: getPreviewAgentEnvironment(import.meta.env.DEV)?.conversationDataEndpointOverride,
    });
    services.provide(
      AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE,
      createHttpConversationDataSource({
        endpoint,
        fetch: createAgentBackendTransport({ development: import.meta.env.DEV }).fetch,
      }),
    );
  }),
  Component: ConversationDataSourcePlugin,
};

export default conversationDataSourcePlugin;
