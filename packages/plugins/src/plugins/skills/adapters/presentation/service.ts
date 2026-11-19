import type { ComposerData } from '@za38.03/agent-ui-plugins/composer-support';
import { readConversationSkillData, type ConversationSkillData } from './skill-data.js';

export const CONVERSATION_SKILLS_SERVICE = 'conversation.skills';
interface SkillSelection {
  skill: ConversationSkillData;
  release: () => void;
}
export interface ConversationSkillComposerBinding {
  setData(data: ComposerData): () => void;
}
/** Skills observes its Host's existing Thread lifecycle through this binding. */
export interface ConversationSkillsLifecycle {
  readonly identity: object;
  getThreadId(): string;
  subscribe(listener: () => void): () => void;
  observeComposer(threadId: string, listener: (event: 'submit' | 'send' | 'reset') => void): () => void;
}
export interface ConversationSkillsService {
  getSnapshot(threadId: string): ConversationSkillData | null;
  subscribe(listener: () => void): () => void;
  select(threadId: string, skill: ConversationSkillData, composer: ConversationSkillComposerBinding): void;
  clear(threadId: string): void;
  /** Observe the existing canonical Runtime; never create a separate Thread store. */
  connect(lifecycle: ConversationSkillsLifecycle): void;
  dispose(): void;
}

/** Created in skills.setup, once for each Agent service scope. */
export function createConversationSkillsService(): ConversationSkillsService {
  const entries = new Map<string, SkillSelection>();
  const listeners = new Set<() => void>();
  let runtime: ConversationSkillsLifecycle | undefined;
  let disconnect: (() => void) | undefined;
  let disposed = false;
  function clear(threadId: string) {
    const entry = entries.get(threadId);
    if (!entry) return;
    entries.delete(threadId);
    entry.release();
    for (const listener of listeners) listener();
  }
  return {
    getSnapshot: threadId => entries.get(threadId)?.skill ?? null,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    select(threadId, value, composer) {
      if (disposed) return;
      const parsed = readConversationSkillData(value);
      if (!parsed) throw new Error('AGENT_UI_INVALID_SKILL');
      const skill = Object.freeze({ id: parsed.id, label: parsed.label });
      // Validate/collect first, so a failed write preserves the previous selection.
      const release = composer.setData({ ...skill });
      entries.get(threadId)?.release();
      entries.set(threadId, { skill, release });
      for (const listener of listeners) listener();
    },
    clear,
    connect(nextRuntime) {
      if (disposed || runtime?.identity === nextRuntime.identity) return;
      disconnect?.();
      for (const threadId of [...entries.keys()]) clear(threadId);
      runtime = nextRuntime;
      let active = nextRuntime.getThreadId();
      let stopComposer = () => {};
      function observeComposer() {
        stopComposer();
        const threadId = active;
        let submitted: SkillSelection | undefined;
        stopComposer = nextRuntime.observeComposer(threadId, event => {
          if (event === 'submit') submitted = entries.get(threadId);
          if (event === 'send') {
            if (entries.get(threadId) === submitted) clear(threadId);
            submitted = undefined;
          }
          if (event === 'reset') clear(threadId);
        });
      }
      observeComposer();
      const stopThreads = nextRuntime.subscribe(() => {
        const next = nextRuntime.getThreadId();
        if (next === active) return;
        clear(active);
        active = next;
        observeComposer();
      });
      disconnect = () => { stopThreads(); stopComposer(); };
    },
    dispose() {
      disposed = true;
      disconnect?.();
      for (const threadId of [...entries.keys()]) clear(threadId);
      listeners.clear();
    },
  };
}
