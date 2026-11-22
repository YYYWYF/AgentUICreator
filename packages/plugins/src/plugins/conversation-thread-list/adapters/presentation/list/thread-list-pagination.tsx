'use client';

import { useEffect, useRef } from 'react';
import { useAui, useAuiState } from '@assistant-ui/react';
import { Button, useLocale } from '../../../../../public.js';

/** Visibility only triggers the canonical Runtime's pagination operation. */
export function ThreadListPagination({ error }: { error?: string | undefined }) {
  const aui = useAui();
  const messages = useLocale('threadList');
  const sentinel = useRef<HTMLDivElement>(null);
  const hasMore = useAuiState((state) => state.threads.hasMore);
  const isLoading = useAuiState((state) => state.threads.isLoading);
  const isLoadingMore = useAuiState((state) => state.threads.isLoadingMore);
  const count = useAuiState((state) => state.threads.threadIds.length + state.threads.archivedThreadIds.length);

  useEffect(() => {
    const element = sentinel.current;
    if (!element || !hasMore || isLoading || isLoadingMore || error || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        // Disconnect before dispatch so repeated observer notifications cannot
        // enqueue more work. The Runtime also deduplicates in-flight page loads.
        observer.disconnect();
        void aui.threads.loadMore();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [aui, hasMore, isLoading, isLoadingMore, count, error]);

  if (!hasMore && !isLoadingMore && !error) return null;

  return (
    <>
      <div ref={sentinel} aria-hidden='true' data-slot='agent-ui-thread-list-sentinel' style={{ height: 1, flexShrink: 0 }} />
      {isLoadingMore && <div role='status'>{messages.loading}</div>}
      {error && (
        <div role='alert' className='conversation-thread-list-error'>
          <strong>{messages.loadFailed}</strong>
          <span>{error}</span>
          <Button disabled={isLoadingMore || !hasMore} size='sm' variant='outline' onClick={() => { void aui.threads.loadMore(); }}>
            {messages.retry}
          </Button>
        </div>
      )}
    </>
  );
}
