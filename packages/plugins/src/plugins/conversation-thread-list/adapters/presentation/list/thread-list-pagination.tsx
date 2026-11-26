'use client';

import { useAui, useAuiState } from '@assistant-ui/react';
import { Button, useLocale } from '../../../../../public.js';

/** Only an explicit click triggers the canonical Runtime's pagination operation. */
export function ThreadListPagination({ error }: { error?: string | undefined }) {
  const aui = useAui();
  const messages = useLocale('threadList');
  const hasMore = useAuiState((state) => state.threads.hasMore);
  const isLoading = useAuiState((state) => state.threads.isLoading);
  const isLoadingMore = useAuiState((state) => state.threads.isLoadingMore);

  if (!hasMore && !isLoadingMore && !error) return null;

  return (
    <div className='conversation-thread-list-pagination' data-slot='agent-ui-thread-list-pagination'>
      {error && (
        <div role='alert' className='conversation-thread-list-error'>
          <strong>{messages.loadFailed}</strong>
          <span>{error}</span>
        </div>
      )}
      <Button
        aria-busy={isLoadingMore}
        data-slot='agent-ui-thread-list-load-more'
        disabled={isLoading || isLoadingMore || !hasMore}
        size='sm'
        variant='outline'
        onClick={() => { void aui.threads.loadMore(); }}
      >
        {isLoadingMore ? messages.loading : error ? messages.retry : messages.loadMore}
      </Button>
    </div>
  );
}
