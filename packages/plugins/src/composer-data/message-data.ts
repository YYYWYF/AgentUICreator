import { snapshotAgentUIContext } from '@za38.03/agent-ui-core';
import type { ComposerData, ComposerDataSource } from './request.js';

export const metadataKey = 'agentUIComposerData';
export const draftMetadataKey = 'agentUIComposerDraftData';
export const editKey = 'agentUIComposerDataEdit';
export const runConfigKey = '__agentUIComposerData';
export const emptyData: Readonly<Record<string, ComposerData>> = Object.freeze({});
const snapshots = new WeakMap<object, Readonly<Record<string, ComposerData>>>();

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Read a submitted message's frozen data without exposing the private envelope. */
export function readComposerMessageData(metadata: unknown): Readonly<Record<string, ComposerData>> {
  const custom = record(metadata);
  const snapshot = record(custom?.[metadataKey]) ?? record(custom?.[draftMetadataKey]);
  if (!snapshot) return emptyData;
  const previous = snapshots.get(snapshot);
  if (previous) return previous;
  const groups = new Map<string, { values: ComposerData[]; references: boolean }>();
  for (const candidate of Object.values(snapshot)) {
    const entry = record(candidate);
    if (!entry || entry.enabled === false || typeof entry.owner !== 'string' || !Object.hasOwn(entry, 'data')) continue;
    const key = entry.owner;
    const value = snapshotAgentUIContext({ value: entry.data })!.value as ComposerData;
    const group = groups.get(key) ?? { values: [], references: false };
    group.values.push(value);
    group.references ||= entry.reference !== undefined;
    groups.set(key, group);
  }
  const data = Object.freeze(
    Object.fromEntries(
      [...groups].map(([key, group]) => [key, group.references ? group.values : group.values.at(-1)!]),
    ),
  );
  snapshots.set(snapshot, data);
  return data;
}

/** Source identities travel with the same immutable message snapshot as data. */
export function readComposerMessageSources(metadata: unknown): Readonly<Record<string, ComposerDataSource>> {
  const custom = record(metadata);
  const snapshot = record(custom?.[metadataKey]) ?? record(custom?.[draftMetadataKey]);
  return Object.fromEntries(Object.values(snapshot ?? {}).flatMap(candidate => {
    const entry = record(candidate);
    if (!entry || entry.enabled === false || typeof entry.owner !== 'string') return [];
    const source = record(entry.source);
    return [[entry.owner, {
      ...(typeof source?.pluginId === 'string' ? { pluginId: source.pluginId } : {}),
      ...(typeof source?.instanceId === 'string' ? { instanceId: source.instanceId } : {}),
      ...(typeof source?.name === 'string' ? { name: source.name } : {}),
    }]];
  }));
}
