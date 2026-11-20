'use client';

import { useContext } from 'react';
import { ConversationThreadListItemByIndex, useLocale, useConversation } from '../../../../../public.js';
import { ThreadListOptionsContext, PolicyThreadListItem } from './policy-context.js';

export function ArchivedThreadList({ searchQuery }: { searchQuery: string }) {
  const labels = useLocale('threadList');
  const { components } = useContext(ThreadListOptionsContext);
  const ids = useConversation((s) => s.threads.archivedThreadIds);
  const items = useConversation((s) => s.threads.threadItems);
  const titles = new Map(items.map((item) => [item.id, typeof item.title === 'string' ? item.title : labels.newChat]));
  const query = searchQuery.trim().toLowerCase();
  const indices = ids
    .map((id, index) => ({ id, index }))
    .filter(({ id }) => !query || (titles.get(id) ?? labels.newChat).toLowerCase().includes(query));
  if (!indices.length) {
    return null;
  }
  return (
    <details data-slot='agent-ui-archived-threads'>
      <summary className='cursor-pointer px-2.5 py-2 text-sm'>{labels.archived}</summary>
      {indices.map(({ id, index }) => (
        <ConversationThreadListItemByIndex
          key={id}
          index={index}
          archived
          components={{ ThreadListItem: components?.ThreadListItem ?? PolicyThreadListItem }}
        />
      ))}
    </details>
  );
}
