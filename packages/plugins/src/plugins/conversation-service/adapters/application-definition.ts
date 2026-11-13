import {AGENT_UI_THREAD_BINDING_SERVICE} from "@za38.03/agent-ui-runtime/plugin-api";
import type { UIPluginDefinition } from '@za38.03/agent-ui-plugins';
import implementation, { createConversationService, createConversationThreadBindingFactory } from '@za38.03/agent-ui-plugins/conversation-service';

import {
  AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE,
  AGENT_UI_CONVERSATION_SERVICE,
  type ConversationDataSource,
} from '../../services/conversations';
import { ConversationServicePlugin } from './index';

export const conversationServicePlugin: UIPluginDefinition = {
  manifest: implementation.manifest,
  inject: [AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE],
  provides: [AGENT_UI_CONVERSATION_SERVICE,AGENT_UI_THREAD_BINDING_SERVICE],
  setup: implementation.bindSetup(({ services }: Parameters<NonNullable<UIPluginDefinition['setup']>>[0]) => {
    const dataSource = services.get<ConversationDataSource>(AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE);
    if (dataSource === undefined) {
      throw new Error('Conversation DataSource is unavailable.');
    }
    const service = createConversationService({
      dataSource,
    });
    services.provide(AGENT_UI_CONVERSATION_SERVICE, service);
    services.provide(AGENT_UI_THREAD_BINDING_SERVICE,createConversationThreadBindingFactory(service));
    service.refresh();
    return () => {
      service.dispose();
    };
  }),
  Component: ConversationServicePlugin,
};

export default conversationServicePlugin;
