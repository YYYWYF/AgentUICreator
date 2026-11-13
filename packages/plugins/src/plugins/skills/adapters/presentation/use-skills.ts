import { useCallback, useSyncExternalStore } from 'react';
import { useAuiState } from '@assistant-ui/react';
import { useConversationComposerRunConfig } from '@za38.03/agent-ui-runtime/plugin-api';
import type { ConversationSkillsService } from './service.js';

export function useConversationSkillsState(service: ConversationSkillsService | undefined) {
  const { threadId, composer } = useConversationComposerRunConfig();
  const disabled = useAuiState(state => state.thread.isDisabled || state.thread.isLoading);
  const subscribe = useCallback((listener: () => void) => service?.subscribe(listener) ?? (() => {}), [service]);
  const snapshot = useCallback(() => service?.getSnapshot(threadId) ?? null, [service, threadId]);
  const selected = useSyncExternalStore(subscribe, snapshot, snapshot);
  return { selected, threadId, composer, disabled: disabled || !composer };
}
