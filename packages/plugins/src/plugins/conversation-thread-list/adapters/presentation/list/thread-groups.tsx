'use client';

import { ThreadListPrimitive } from '@assistant-ui/react';
import { Fragment, type FC } from 'react';
import { useThreadListGroups } from './use-thread-groups.js';
import { ThreadListItem } from './primitives/thread-item.js';

export const ThreadListItemGroups: FC<{ searchQuery?: string }> = ({ searchQuery = '' }) => {
  const { threadIds, filteredIndices, groups } = useThreadListGroups(searchQuery);
  const query = searchQuery.trim();

  if (query && filteredIndices.length === 0) {
    return (
      <div
        data-agent-ui-owned=''
        data-slot='aui_thread-list-empty'
        className='text-muted-foreground px-2.5 py-4 text-sm'
      >
        No threads found
      </div>
    );
  }

  if (!groups) {
    return filteredIndices.map((index) => (
      <ThreadListPrimitive.ItemByIndex key={threadIds[index]} index={index} components={{ ThreadListItem }} />
    ));
  }

  return groups.map((group) => (
    <Fragment key={group.id}>
      <div
        data-agent-ui-owned=''
        data-slot='aui_thread-list-group-label'
        className='text-muted-foreground px-2.5 pt-3 pb-1 text-xs font-medium'
      >
        {group.label}
      </div>
      {group.indices.map((index) => (
        <ThreadListPrimitive.ItemByIndex key={threadIds[index]} index={index} components={{ ThreadListItem }} />
      ))}
    </Fragment>
  ));
};
