import { useLayoutEffect, useMemo } from 'react';
import { useAui, useAuiState } from '@assistant-ui/react';
import { usePluginService } from '@za38.03/agent-ui-runtime/plugin-api';
import { CONVERSATION_SKILLS_SERVICE, type ConversationSkillsService, type ConversationSkillsLifecycle, type ConversationSkillComposerBinding } from './service.js';
import type { ConversationSkillData } from './skill-data.js';

function useSkillSelectionController() {
  const service = usePluginService<ConversationSkillsService>(CONVERSATION_SKILLS_SERVICE);
  const aui = useAui();
  const threadId = useAuiState(state => state.threads.mainThreadId);
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
  return useMemo(() => {
    let snapshot: ConversationSkillsSnapshot | undefined;
    const getSnapshot = () => {
      const thread = aui.thread.getState();
      const selected = service?.getSnapshot(threadId) ?? null;
      const disabled = thread.isDisabled || thread.isLoading;
      if (!snapshot || snapshot.selected !== selected || snapshot.disabled !== disabled) {
        snapshot = { selected, disabled, threadId };
      }
      return snapshot;
    };
    return {
      threadId,
      serviceAvailable: service !== undefined,
      getSnapshot,
      subscribe(listener: () => void) {
        const stopService = service?.subscribe(listener);
        const stopThread = aui.subscribe(listener);
        return () => { stopService?.(); stopThread(); };
      },
      select(skill: ConversationSkillData, composer: ConversationSkillComposerBinding) {
        if (!service) throw new Error('CONVERSATION_SKILLS_SERVICE_UNAVAILABLE');
        service.select(threadId, skill, composer);
      },
      clear() { service?.clear(threadId); },
    };
  }, [service, threadId, aui]);
}

export interface ConversationSkillsSnapshot {
  readonly selected: ConversationSkillData | null;
  readonly threadId: string;
  readonly disabled: boolean;
}
export type ConversationSkillsController = ReturnType<typeof useSkillSelectionController>;
export function useSkillSelection(): ConversationSkillsController;
export function useSkillSelection<T>(selector: (snapshot: ConversationSkillsSnapshot) => T): T;
export function useSkillSelection<T>(selector: ((snapshot: ConversationSkillsSnapshot) => T) | undefined): ConversationSkillsController | T;
export function useSkillSelection<T>(selector?: (snapshot: ConversationSkillsSnapshot) => T): ConversationSkillsController | T {
  const controller = useSkillSelectionController();
  return usePluginService(controller, selector);
}
