import { usePluginService, useConversationActions as useRuntimeConversationActions } from '@za38.03/agent-ui-plugins';
import { useMemo } from 'react';
import { AGENT_UI_CONVERSATION_SERVICE, EMPTY_CONVERSATION_SNAPSHOT, type ConversationService, type ConversationSnapshot } from '../conversations';

function useConversationsController() {
  const service = usePluginService<ConversationService>(AGENT_UI_CONVERSATION_SERVICE);
  const actions = useRuntimeConversationActions();
  return useMemo(() => {
    const requireService = () => {
      if (service === undefined) throw new Error('CONVERSATION_SERVICE_UNAVAILABLE');
      return service;
    };
    return {
      serviceAvailable: service !== undefined,
      getSnapshot: () => service?.getSnapshot() ?? EMPTY_CONVERSATION_SNAPSHOT,
      subscribe: (listener: () => void) => service?.subscribe(listener) ?? (() => {}),
      refresh: () => service?.refresh(),
      selectConversation: async (id: string) => { requireService(); await actions.selectConversation(id); },
      deleteConversation: async (id: string) => { requireService(); await actions.deleteConversation(id); },
      renameConversation: async (id: string, title: string) => { requireService(); await actions.renameConversation(id, title); },
      archiveConversation: async (id: string) => { requireService(); await actions.archiveConversation(id); },
      unarchiveConversation: async (id: string) => { requireService(); await actions.unarchiveConversation(id); },
      loadConversation: async (id: string) => requireService().loadConversation(id),
    };
  }, [service, actions]);
}

export type ConversationsController = ReturnType<typeof useConversationsController>;
export function useConversations(): ConversationsController;
export function useConversations<T>(selector: (snapshot: ConversationSnapshot) => T): T;
export function useConversations<T>(selector: ((snapshot: ConversationSnapshot) => T) | undefined): ConversationsController | T;
export function useConversations<T>(selector?: (snapshot: ConversationSnapshot) => T): ConversationsController | T {
  const controller = useConversationsController();
  return usePluginService(controller, selector);
}
