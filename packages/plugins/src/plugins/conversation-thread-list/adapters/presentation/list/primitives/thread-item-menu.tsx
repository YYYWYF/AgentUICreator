'use client';

import { Button } from '../../../../../../internal/adapters-generated/assistant-ui/components/ui/button';
import { ThreadListItemMorePrimitive, ThreadListItemPrimitive } from '@assistant-ui/react';
import { ArchiveIcon, MoreHorizontalIcon, PencilIcon, TrashIcon } from 'lucide-react';
import { type FC } from 'react';

export const ThreadListItemMore: FC<{ onRename: () => void }> = ({ onRename }) => {
  return (
    <ThreadListItemMorePrimitive.Root sharedFocusGroup>
      <ThreadListItemMorePrimitive.Trigger asChild>
        <Button
          data-agent-ui-owned=''
          variant='ghost'
          size='icon'
          data-slot='aui_thread-list-item-more'
          className='data-[state=open]:bg-accent absolute end-1.5 top-1/2 size-6 -translate-y-1/2 p-0 opacity-0 group-hover/thread-list-item:opacity-100 group-has-focus-visible/thread-list-item:opacity-100 group-data-active/thread-list-item:opacity-100 data-[state=open]:opacity-100'
        >
          <MoreHorizontalIcon className='size-3.5' />
          <span data-agent-ui-owned='' className='sr-only'>
            More options
          </span>
        </Button>
      </ThreadListItemMorePrimitive.Trigger>
      <ThreadListItemMorePrimitive.Content
        data-agent-ui-owned=''
        side='right'
        align='start'
        sideOffset={6}
        data-slot='aui_thread-list-item-more-content'
        className='bg-popover text-popover-foreground data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:animate-out data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-32 overflow-hidden rounded-xl border p-1.5'
      >
        <ThreadListItemMorePrimitive.Item
          data-agent-ui-owned=''
          data-slot='aui_thread-list-item-more-item'
          className='hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none'
          onSelect={onRename}
        >
          <PencilIcon className='size-4' />
          Rename
        </ThreadListItemMorePrimitive.Item>
        <ThreadListItemPrimitive.Archive asChild>
          <ThreadListItemMorePrimitive.Item
            data-agent-ui-owned=''
            data-slot='aui_thread-list-item-more-item'
            className='hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none'
          >
            <ArchiveIcon className='size-4' />
            Archive
          </ThreadListItemMorePrimitive.Item>
        </ThreadListItemPrimitive.Archive>
        <ThreadListItemPrimitive.Delete asChild>
          <ThreadListItemMorePrimitive.Item
            data-agent-ui-owned=''
            data-slot='aui_thread-list-item-more-item'
            className='text-destructive hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none'
          >
            <TrashIcon className='size-4' />
            Delete
          </ThreadListItemMorePrimitive.Item>
        </ThreadListItemPrimitive.Delete>
      </ThreadListItemMorePrimitive.Content>
    </ThreadListItemMorePrimitive.Root>
  );
};
