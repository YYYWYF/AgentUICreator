'use client';

import { Skeleton } from '../../../../../internal/adapters-generated/assistant-ui/components/ui/skeleton';
import { type FC } from 'react';

export const ThreadListSkeleton: FC = () => {
  return (
    <div data-agent-ui-owned='' role='status' aria-label='Loading threads' className='flex flex-col gap-0.5'>
      {Array.from({ length: 5 }, (_, i) => (
        <div
          data-agent-ui-owned=''
          key={i}
          aria-hidden='true'
          data-slot='aui_thread-list-skeleton-wrapper'
          className='flex h-8 items-center px-2.5'
        >
          <Skeleton data-agent-ui-owned='' data-slot='aui_thread-list-skeleton' className='h-3.5 w-full' />
        </div>
      ))}
    </div>
  );
};
