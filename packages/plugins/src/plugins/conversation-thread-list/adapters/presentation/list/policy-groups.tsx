'use client';

import { Fragment, useContext, type FC } from 'react';
import {
  ConversationIf,
  ConversationThreadListItemByIndex,
  Skeleton,
  useLocale,
  useConversationThreadListGroups,
} from '../../../../../public.js';
import { ThreadListOptionsContext, PolicyThreadListItem } from './policy-context.js';
import { ThreadListPagination } from './thread-list-pagination.js';

export const PolicyThreadListSkeleton: FC = () => {
  const messages = useLocale('threadList');
  return (
    <div className='flex flex-col gap-0.5'>
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          role='status'
          aria-label={messages.loading}
          data-slot='aui_thread-list-skeleton-wrapper'
          className='flex h-8 items-center px-2.5'
        >
          <Skeleton data-slot='aui_thread-list-skeleton' className='h-3.5 w-full' />
        </div>
      ))}
    </div>
  );
};

export const PolicyThreadListItemGroups: FC<{ searchQuery?: string }> = ({ searchQuery = '' }) => {
  const messages = useLocale('threadList');
  const { components } = useContext(ThreadListOptionsContext);
  const { threadIds, filteredIndices, groups } = useConversationThreadListGroups(searchQuery);

  if (filteredIndices.length === 0) {
    return (
      <div data-slot='aui_thread-list-empty' className='text-muted-foreground px-2.5 py-4 text-sm'>
        {messages.empty}
      </div>
    );
  }

  if (!groups) {
    return filteredIndices.map((index) => (
      <ConversationThreadListItemByIndex
        key={threadIds[index]}
        index={index}
        components={{ ThreadListItem: components?.ThreadListItem ?? PolicyThreadListItem }}
      />
    ));
  }

  return groups.map((group) => (
    <Fragment key={group.id}>
      <div
        data-slot='aui_thread-list-group-label'
        className='text-muted-foreground px-2.5 pt-3 pb-1 text-xs font-medium'
      >
        {group.label}
      </div>
      {group.indices.map((index) => (
        <ConversationThreadListItemByIndex
          key={threadIds[index]}
          index={index}
          components={{ ThreadListItem: components?.ThreadListItem ?? PolicyThreadListItem }}
        />
      ))}
    </Fragment>
  ));
};

export const PolicyThreadListItems: FC<{ searchQuery?: string; loadMoreError?: string | undefined }> = ({ searchQuery = '', loadMoreError }) => {
  return (
    <div data-slot='aui_thread-list-items' className='flex flex-col gap-0.5'>
      <ConversationIf condition={(s) => s.threads.isLoading}>
        <PolicyThreadListSkeleton />
      </ConversationIf>
      <ConversationIf condition={(s) => !s.threads.isLoading}>
        <PolicyThreadListItemGroups searchQuery={searchQuery} />
      </ConversationIf>
      <ThreadListPagination error={loadMoreError} />
    </div>
  );
};
