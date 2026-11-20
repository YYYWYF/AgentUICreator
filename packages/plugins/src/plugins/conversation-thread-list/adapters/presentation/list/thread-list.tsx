'use client';

import { cn } from '../../../../../internal/vendor-generated/assistant-ui/lib/utils.js';
import { AuiIf, ThreadListPrimitive, useAuiState } from '@assistant-ui/react';
import { useState, type ComponentPropsWithoutRef, type FC } from 'react';
import { ThreadListNew } from './thread-new.js';
import { ThreadListSearch } from './thread-search.js';
import { ThreadListSkeleton } from './thread-loading.js';
import { ThreadListItemGroups } from './thread-groups.js';

export const ThreadList: FC = () => {
  const [search, setSearch] = useState('');
  const hasThreads = useAuiState((s) => s.threads.threadIds.length > 0);

  return (
    <ThreadListRoot>
      <ThreadListNew />
      {hasThreads && <ThreadListSearch value={search} onValueChange={setSearch} />}
      <ThreadListItems searchQuery={hasThreads ? search : ''} />
    </ThreadListRoot>
  );
};

export const ThreadListRoot: FC<ComponentPropsWithoutRef<typeof ThreadListPrimitive.Root>> = ({
  className,
  ...props
}) => {
  return (
    <ThreadListPrimitive.Root
      data-agent-ui-owned=''
      data-slot='aui_thread-list-root'
      className={cn('flex flex-col gap-0.5', className)}
      {...props}
    />
  );
};

export const ThreadListItems: FC<ComponentPropsWithoutRef<'div'> & { searchQuery?: string }> = ({
  className,
  searchQuery = '',
  ...props
}) => {
  return (
    <div
      data-agent-ui-owned=''
      data-slot='aui_thread-list-items'
      className={cn('flex flex-col gap-0.5', className)}
      {...props}
    >
      <AuiIf condition={(s) => s.threads.isLoading}>
        <ThreadListSkeleton />
      </AuiIf>
      <AuiIf condition={(s) => !s.threads.isLoading}>
        <ThreadListItemGroups searchQuery={searchQuery} />
      </AuiIf>
    </div>
  );
};
