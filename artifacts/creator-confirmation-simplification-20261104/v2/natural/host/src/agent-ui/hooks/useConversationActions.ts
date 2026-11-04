import { useCallback } from "react";
import { useConversationActions as useRuntimeConversationActions, usePluginService } from "@za38.03/agent-ui-plugins";
import { AGENT_UI_CONVERSATION_SERVICE, type ConversationService } from "../services/conversations";

/** Commands reuse the canonical Runtime; this hook does not subscribe to history state. */
export function useConversationActions() {
  const service = usePluginService<ConversationService>(AGENT_UI_CONVERSATION_SERVICE);
  const refresh = useCallback(() => service?.refresh(), [service]);
  const actions = useRuntimeConversationActions();
  const requireService = useCallback(() => {
    if (service === undefined) throw new Error("CONVERSATION_SERVICE_UNAVAILABLE");
    return service;
  }, [service]);

  const deleteConversation = useCallback(async (id: string) => {
    requireService();
    await actions.deleteConversation(id);
  }, [actions, requireService]);
  const renameConversation = useCallback(async (id: string, title: string) => {
    requireService();
    await actions.renameConversation(id, title);
  }, [actions, requireService]);
  const archiveConversation = useCallback(async (id: string) => {
    requireService();
    await actions.archiveConversation(id);
  }, [actions, requireService]);
  const unarchiveConversation = useCallback(async (id: string) => {
    requireService();
    await actions.unarchiveConversation(id);
  }, [actions, requireService]);
  // Selection completes navigation; snapshot reports history loading/errors.
  // Independent detail reads below leave the selected thread alone.
  const selectConversation = useCallback(async (id: string) => {
    requireService();
    await actions.selectConversation(id);
  }, [actions, requireService]);
  const loadConversation = useCallback(async (id: string) => (
    requireService().loadConversation(id)
  ), [requireService]);


  return {
    serviceAvailable: service !== undefined, refresh,
    deleteConversation, renameConversation, archiveConversation,
    unarchiveConversation, selectConversation, loadConversation,
  };
}
