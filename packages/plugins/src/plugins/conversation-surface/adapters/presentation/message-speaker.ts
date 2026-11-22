export interface MessageSpeaker {
  readonly id: string;
  readonly name: string;
  readonly avatarUrl?: string;
}

/** Derive presentation identity without changing the source metadata. */
export function parseMessageSpeaker(
  value: unknown,
  previous?: MessageSpeaker | null,
): MessageSpeaker | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  if (typeof source.id !== 'string' || !source.id.trim() || typeof source.name !== 'string' || !source.name.trim()) return undefined;
  const avatarUrl = typeof source.avatarUrl === 'string' && source.avatarUrl.trim() ? source.avatarUrl : undefined;
  if (previous?.id === source.id && previous.name === source.name && previous.avatarUrl === avatarUrl) return previous;
  return { id: source.id, name: source.name, ...(avatarUrl === undefined ? {} : { avatarUrl }) };
}
