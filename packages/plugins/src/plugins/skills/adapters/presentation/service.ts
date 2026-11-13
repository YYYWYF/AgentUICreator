import type { ConversationComposerRunConfigPort } from '@za38.03/agent-ui-runtime/plugin-api';
import type { ConversationSkill } from './skills.js';

export const CONVERSATION_SKILLS_SERVICE = 'conversation.skills';
/** A port bound to one concrete native Thread, never the mutable main Thread. */
export type ConversationSkillComposerBinding = ConversationComposerRunConfigPort;
export interface ConversationSkillsService {
  getSnapshot(threadId: string): ConversationSkill | null;
  subscribe(listener: () => void): () => void;
  select(threadId: string, skill: ConversationSkill, composer: ConversationSkillComposerBinding): void;
  updatePresentation(threadId: string, skill: ConversationSkill): void;
  clear(threadId: string): void;
  dispose(): void;
}
export function createConversationSkillsService(): ConversationSkillsService {
  type Entry = {
    skill: ConversationSkill;
    composer: ConversationSkillComposerBinding;
    previous: Record<string, { present: boolean; value: unknown }>;
    applied: Record<string, unknown>;
  };
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  let disposed = false;
  const notify = () => { for (const listener of listeners) listener(); };
  function restore(entry: Entry) {
    const config = entry.composer.getRunConfig();
    if (!config || !Object.keys(entry.applied).length) return;
    const custom = { ...config.custom };
    let changed = false;
    for (const [key, applied] of Object.entries(entry.applied)) {
      // Preserve fields changed by another application control after selection.
      if (!Object.hasOwn(custom, key) || !Object.is(custom[key], applied)) continue;
      const previous = entry.previous[key]!;
      if (previous.present) custom[key] = previous.value;
      else delete custom[key];
      changed = true;
    }
    if (changed) entry.composer.setRunConfig({ ...config, custom });
  }
  function clear(threadId: string) {
    const entry = entries.get(threadId);
    if (!entry) return;
    entries.delete(threadId);
    restore(entry);
    notify();
  }
  return {
    getSnapshot: threadId => entries.get(threadId)?.skill ?? null,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    select(threadId, skill, composer) {
      if (disposed) return;
      const previousEntry = entries.get(threadId);
      if (previousEntry) restore(previousEntry);
      const config = composer.getRunConfig();
      if (!config) { clear(threadId); return; }
      const applied = { ...skill.runConfig?.custom };
      const previous = Object.fromEntries(Object.keys(applied).map(key => [key, {
        present: Object.hasOwn(config.custom ?? {}, key), value: config.custom?.[key],
      }]));
      if (Object.keys(applied).length) composer.setRunConfig({ ...config, custom: { ...config.custom, ...applied } });
      entries.set(threadId, { skill, composer, previous, applied });
      notify();
    },
    clear,
    updatePresentation(threadId, skill) {
      const entry = entries.get(threadId);
      if (!entry || entry.skill.id !== skill.id) return;
      const { description: _description, icon: _icon, ...previous } = entry.skill;
      entries.set(threadId, { ...entry, skill: { ...previous, label: skill.label,
        ...(skill.description === undefined ? {} : { description: skill.description }),
        ...(skill.icon === undefined ? {} : { icon: skill.icon }) } });
      notify();
    },
    dispose() {
      disposed = true;
      for (const threadId of [...entries.keys()]) clear(threadId);
      listeners.clear();
    },
  };
}
