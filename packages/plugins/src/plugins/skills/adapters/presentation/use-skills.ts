import { useLayoutEffect, useMemo } from 'react';
import { useAui, useAuiState } from '@assistant-ui/react';
import { usePluginService, usePluginServiceSnapshot } from '@za38.03/agent-ui-runtime/plugin-api';
import { CONVERSATION_SKILLS_SERVICE, type ConversationSkillsService, type ConversationSkillsLifecycle } from './service.js';

export function useConversationSkillsState() {
  const service = usePluginService<ConversationSkillsService>(CONVERSATION_SKILLS_SERVICE);
  const aui = useAui();
  const threadId = useAuiState(state => state.threads.mainThreadId);
  const disabled = useAuiState(state => state.thread.isDisabled || state.thread.isLoading);
  const observable = useMemo(() => service ? {
    getSnapshot: () => service.getSnapshot(threadId), subscribe: service.subscribe,
  } : undefined, [service, threadId]);
  const selected = usePluginServiceSnapshot(observable, null);
  const lifecycle = useMemo<ConversationSkillsLifecycle | undefined>(() => {
    const runtime = aui.threads.__internal_getAssistantRuntime?.();
    if (!runtime) return undefined;
    return {
      identity: runtime,
      getThreadId: () => runtime.threads.getState().mainThreadId,
      subscribe: listener => runtime.threads.subscribe(listener),
      observeComposer(threadId, listener) {
        const composer = runtime.threads.getById(threadId).composer;
        let hadRunConfig = Object.keys(composer.getState().runConfig).length > 0;
        const stopState = composer.subscribe(() => {
          const state = composer.getState();
          const hasRunConfig = Object.keys(state.runConfig).length > 0;
          // Native reset clears configuration even when text was already empty,
          // in which case upstream emits no textChange event.
          const reset = hadRunConfig && !hasRunConfig && state.isEmpty && !state.submission;
          hadRunConfig = hasRunConfig;
          if (reset) listener('reset');
        });
        const stopSend = composer.unstable_on('send', () => listener('send'));
        const stopText = composer.unstable_on('textChange', event => {
          if (event.origin === 'send') listener('submit');
          if (event.origin === 'reset') listener('reset');
        });
        return () => { stopSend(); stopText(); stopState(); };
      },
    };
  }, [aui]);
  useLayoutEffect(() => {
    if (lifecycle) service?.connect(lifecycle);
    // Service setup owns the connection's cleanup, independently of either UI.
  }, [lifecycle, service]);
  return { service, selected, threadId, disabled };
}
