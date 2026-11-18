import { snapshotAgentUIContext } from '@za38.03/agent-ui-core';
import type { ComposerData, ComposerDataOptions } from '@za38.03/agent-ui-runtime/plugin-api';
import type { ConversationSkill } from './skills.js';

export const CONVERSATION_SKILLS_SERVICE = 'conversation.skills';
export type ConversationSkillRequestItem = Omit<ConversationSkill, 'icon'>;
export type ConversationSkillRequestAdapter = (skill: ConversationSkillRequestItem) => ComposerData;
/** Bound to the selecting Plugin's concrete Thread and data owner. */
export interface ConversationSkillComposerBinding {
  setData(data: ComposerData, options?: ComposerDataOptions): () => void;
}
export interface ConversationSkillsService {
  getSnapshot(threadId: string): ConversationSkill | null;
  subscribe(listener: () => void): () => void;
  select(threadId: string, skill: ConversationSkill, composer: ConversationSkillComposerBinding, requestAdapter?: ConversationSkillRequestAdapter): void;
  updatePresentation(threadId: string, skill: ConversationSkill): void;
  clear(threadId: string): void;
  dispose(): void;
}
export function createConversationSkillsService(): ConversationSkillsService {
  const entries = new Map<string, { skill: ConversationSkill; clear: () => void }>();
  const listeners = new Set<() => void>();
  let disposed = false;
  const notify = () => { for (const listener of listeners) listener(); };
  function clear(threadId: string) {
    const entry = entries.get(threadId);
    if (!entry) return;
    entries.delete(threadId);
    entry.clear();
    notify();
  }
  return {
    getSnapshot: threadId => entries.get(threadId)?.skill ?? null,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    select(threadId, skill, composer, requestAdapter) {
      if (disposed) return;
      const { icon: _icon, ...selected } = skill;
      const raw = snapshotAgentUIContext(Object.fromEntries(Object.entries(selected).filter(([, value]) => value !== undefined)))!;
      const defaults = { ...skill.ctx };
      const data = requestAdapter ? requestAdapter(structuredClone(raw) as unknown as ConversationSkillRequestItem) : defaults as ComposerData;
      const release = composer.setData(data, {
        selection: raw as ComposerData,
        includeInRequest: requestAdapter !== undefined,
        ...(!requestAdapter && Object.keys(defaults).length ? { defaultForwardedProps: { ctx: defaults as ComposerData } } : {}),
      });
      entries.get(threadId)?.clear();
      entries.set(threadId, { skill, clear: release });
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
