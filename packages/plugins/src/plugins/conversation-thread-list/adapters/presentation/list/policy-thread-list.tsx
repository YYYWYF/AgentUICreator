'use client';

import { useState, type ComponentProps, type ComponentType } from 'react';
import {
  ConversationThreadListRoot,
  ConversationThreadListSearch,
  useLocale,
  useConversation,
  type ConversationThreadListItemProps,
} from '../../../../../public.js';
import { ThreadListOptionsContext } from './policy-context.js';
import { PolicyThreadListItems } from './policy-groups.js';
import { ArchivedThreadList } from './archived-threads.js';

export interface PolicyThreadListProps extends Omit<ComponentProps<typeof ConversationThreadListRoot>, 'children'> {
  /** Disabling search also removes its query from list filtering. */
  showSearch?: boolean;
  /** Include the archive section, with the same search and item customizations. */
  showArchived?: boolean;
  searchProps?: Partial<Omit<ComponentProps<typeof ConversationThreadListSearch>, 'children' | 'defaultValue'>>;
  itemProps?: ConversationThreadListItemProps;
  components?: { ThreadListItem?: ComponentType };
  loadMoreError?: string | undefined;
}

export function PolicyThreadList({
  showSearch = true,
  showArchived = true,
  searchProps,
  itemProps,
  components,
  loadMoreError,
  ...elementProps
}: PolicyThreadListProps) {
  const messages = useLocale('threadList');
  const [search, setSearch] = useState('');
  const hasThreads = useConversation(
    (s) => s.threads.threadIds.length > 0 || (showArchived && s.threads.archivedThreadIds.length > 0),
  );

  return (
    <ThreadListOptionsContext.Provider value={{ itemProps, components }}>
      <ConversationThreadListRoot {...elementProps}>
        {showSearch && hasThreads && (
          <ConversationThreadListSearch
            placeholder={messages.search}
            aria-label={messages.search}
            {...searchProps}
            value={searchProps?.value ?? search}
            onValueChange={(value) => {
              setSearch(value);
              searchProps?.onValueChange?.(value);
            }}
          />
        )}
        <PolicyThreadListItems searchQuery={showSearch && hasThreads ? (searchProps?.value ?? search) : ''} loadMoreError={loadMoreError} />
        {showArchived && (
          <ArchivedThreadList searchQuery={showSearch && hasThreads ? (searchProps?.value ?? search) : ''} />
        )}
      </ConversationThreadListRoot>
    </ThreadListOptionsContext.Provider>
  );
}
