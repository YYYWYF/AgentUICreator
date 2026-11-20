'use client';

import { ThreadListItemPrimitive, useAuiState } from '@assistant-ui/react';
import { Loader2Icon } from 'lucide-react';
import { useEffect, useRef, useState, type FC } from 'react';
import { ThreadListItemRename } from './thread-item-rename.js';
import { ThreadListItemMore } from './thread-item-menu.js';

export const ThreadListItem: FC = () => {
  const isRunning = useAuiState((s) => s.threadListItem.isRunning);
  const [isRenaming, setIsRenaming] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);

  useEffect(() => {
    if (isRenaming || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    triggerRef.current?.focus();
  }, [isRenaming]);

  return (
    <ThreadListItemPrimitive.Root
      data-agent-ui-owned=''
      data-slot='aui_thread-list-item'
      className='group hover:bg-muted focus-visible:bg-muted data-active:bg-muted has-focus-visible:bg-muted has-data-[state=open]:bg-muted relative flex h-8 items-center rounded-md transition-colors focus-visible:outline-none'
    >
      {isRenaming ? (
        <ThreadListItemRename
          onDone={(restoreFocus) => {
            restoreFocusRef.current = restoreFocus;
            setIsRenaming(false);
          }}
        />
      ) : (
        <ThreadListItemPrimitive.Trigger
          data-agent-ui-owned=''
          ref={triggerRef}
          data-slot='aui_thread-list-item-trigger'
          className='focus-visible:ring-ring/50 flex h-full min-w-0 flex-1 items-center rounded-md px-2.5 text-start text-sm outline-none group-hover:pe-9 group-has-focus-visible:pe-9 group-has-data-[state=open]:pe-9 group-data-active:pe-9 focus-visible:ring-1'
        >
          {isRunning && (
            <Loader2Icon
              data-agent-ui-owned=''
              aria-hidden
              data-slot='aui_thread-list-item-running'
              className='text-muted-foreground me-1.5 size-3.5 shrink-0 animate-spin'
            />
          )}
          <span data-agent-ui-owned='' data-slot='aui_thread-list-item-title' className='min-w-0 flex-1 truncate'>
            <ThreadListItemPrimitive.Title fallback='New Chat' />
          </span>
          {isRunning && (
            <span data-agent-ui-owned='' className='sr-only'>
              Running
            </span>
          )}
        </ThreadListItemPrimitive.Trigger>
      )}
      <ThreadListItemMore onRename={() => setIsRenaming(true)} />
    </ThreadListItemPrimitive.Root>
  );
};
