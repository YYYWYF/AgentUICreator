'use client';

import { useLocale } from '../../../../../locale.js';
import { useAuiState } from '@assistant-ui/react';
import { useMemo, useSyncExternalStore } from 'react';

export const dateGroupLabel = (date: Date | undefined, startOfToday: number, startOfYesterday: number): string => {
  if (!date || date.getTime() >= startOfToday) return 'Today';
  if (date.getTime() >= startOfYesterday) return 'Yesterday';
  return 'Earlier';
};

export const startOfLocalDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

export const subscribeToNextDay = (onDayChange: () => void) => {
  let timeout: number;
  const scheduleNextDay = () => {
    const now = new Date();
    const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    timeout = window.setTimeout(() => {
      onDayChange();
      scheduleNextDay();
    }, startOfTomorrow - now.getTime());
  };
  scheduleNextDay();
  return () => window.clearTimeout(timeout);
};

export const getStartOfToday = () => startOfLocalDay(new Date());

// A server render and hydration see no day start, so a prerender never reads
// the clock; a client-only mount groups on its first render.
export const getServerStartOfToday = () => undefined;

export const useStartOfToday = () =>
  useSyncExternalStore<number | undefined>(subscribeToNextDay, getStartOfToday, getServerStartOfToday);

export type ThreadListGroup = { id: string; label: string; indices: number[] };

/**
 * Filters the thread list by title and labels adjacent matches by last activity
 * (Today, Yesterday, Earlier), preserving the runtime's server/page order.
 * `groups` is null when no thread carries a date
 * or while the local day start is unknown during server render and hydration,
 * in which case `filteredIndices` keeps the runtime order.
 */
export const useThreadListGroups = (searchQuery = '') => {
  const messages = useLocale('threadList');
  const threadIds = useAuiState((s) => s.threads.threadIds);
  const threadItems = useAuiState((s) => s.threads.threadItems);

  const query = searchQuery.trim().toLowerCase();
  const startOfToday = useStartOfToday();

  return useMemo(() => {
    const itemsById = new Map(threadItems.map((item) => [item.id, item]));
    const dates = threadIds.map((id) => itemsById.get(id)?.lastMessageAt);
    const filteredIndices = threadIds
      .map((id, index) => ({ id, index }))
      .filter(({ id }) => !query || (itemsById.get(id)?.title || messages.newChat).toLowerCase().includes(query))
      .map(({ index }) => index);
    if (startOfToday === undefined || !filteredIndices.some((index) => dates[index])) {
      return { threadIds, filteredIndices, groups: null };
    }

    const yesterday = new Date(startOfToday);
    yesterday.setDate(yesterday.getDate() - 1);
    const startOfYesterday = yesterday.getTime();
    const result: ThreadListGroup[] = [];
    const seenLabels = new Set<string>();
    for (const index of filteredIndices) {
      const id = dateGroupLabel(dates[index], startOfToday, startOfYesterday);
      const lastGroup = result[result.length - 1];
      if (lastGroup?.label === id) {
        lastGroup.indices.push(index);
      } else {
        const groupId = seenLabels.has(id) ? `${id}:${threadIds[index]}` : id;
        seenLabels.add(id);
        result.push({ id: groupId, label: id, indices: [index] });
      }
    }
    return {
      threadIds,
      filteredIndices,
      groups: result.map((group) => ({
        ...group,
        label:
          (
            { Today: messages.today, Yesterday: messages.yesterday, Earlier: messages.earlier } as Record<
              string,
              string
            >
          )[group.label] ?? group.label,
      })),
    };
  }, [threadIds, threadItems, query, startOfToday, messages]);
};
