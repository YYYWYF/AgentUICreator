import type {
  ComposerData,
  ComposerDataSource,
  ComposerMessageDataAdapter,
} from '@za38.03/agent-ui-plugins/composer-support';

export interface ConversationSkillData {
  readonly id: string;
  readonly label: string;
}

export function readConversationSkillData(value: unknown): ConversationSkillData | null {
  return typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'id' in value &&
    typeof value.id === 'string' &&
    value.id.trim().length > 0 &&
    'label' in value &&
    typeof value.label === 'string' &&
    value.label.trim().length > 0
    ? (value as ConversationSkillData)
    : null;
}

/** Identify the capability by provenance, independently of instance names. */
export function readSubmittedSkill(
  data: Readonly<Record<string, ComposerData>>,
  sources: Readonly<Record<string, ComposerDataSource>>,
): ConversationSkillData | null {
  for (const [owner, source] of Object.entries(sources)) {
    if (source.pluginId === 'skills') {
      const skill = readConversationSkillData(data[owner]);
      if (skill) return skill;
    }
  }
  return null;
}

/** Public message persistence belongs to the skill capability, not Composer. */
export const skillsMessageDataAdapter: ComposerMessageDataAdapter = {
  metadataKeys: ['skill'],
  fromMetadata(metadata): Readonly<Record<string, ComposerData>> {
    const skill = readConversationSkillData(metadata.skill);
    return skill ? { skills: { id: skill.id, label: skill.label } } : {};
  },
  toMetadata(data, sources): Readonly<Record<string, ComposerData>> {
    const skill = readSubmittedSkill(data, sources);
    return skill ? { skill: { id: skill.id, label: skill.label } } : {};
  },
};
