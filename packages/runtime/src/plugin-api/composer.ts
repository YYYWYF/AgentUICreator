import { useMemo } from 'react';
import { useAui, useAuiState } from '@assistant-ui/react';

export interface ConversationComposerRunConfig {
  readonly custom?: Record<string, unknown>;
}
export interface ConversationComposerRunConfigPort {
  /** Undefined after this concrete Thread has been removed. */
  getRunConfig(): ConversationComposerRunConfig | undefined;
  setRunConfig(config: ConversationComposerRunConfig): void;
}

/** Canonical adapter boundary. The handle stays bound to its original Thread. */
export function useConversationComposerRunConfig() {
  const aui = useAui();
  const threadId = useAuiState(state => state.threads.mainThreadId);
  const runtime = aui.threads().__internal_getAssistantRuntime?.();
  const composer = useMemo<ConversationComposerRunConfigPort | undefined>(() => {
    if (!runtime) return undefined;
    const native = runtime.threads.getById(threadId).composer;
    const exists = () => {
      const state = runtime.threads.getState();
      return state.mainThreadId === threadId || state.newThreadId === threadId ||
        state.threadIds.includes(threadId) || state.archivedThreadIds.includes(threadId);
    };
    return {
      getRunConfig: () => exists() ? native.getState().runConfig : undefined,
      setRunConfig: config => { if (exists()) native.setRunConfig(config); },
    };
  }, [runtime, threadId]);
  return { threadId, composer };
}
