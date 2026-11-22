'use client';
import { useLocale } from '../../../../../locale.js';
import { ThreadListItemPrimitive, useAuiState } from '@assistant-ui/react';
import { Loader2Icon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ThreadRename } from './thread-item-rename.js';
import { ThreadItemMenu } from './thread-item-menu.js';

export interface ConversationThreadListItemActions {
  rename?: boolean;
  archive?: boolean;
  unarchive?: boolean;
  delete?: boolean;
}

export interface ConversationThreadListItemProps {
  /** Omitted: preserve upstream presentation. Supplied: opt in to each action. */
  onNavigate?: (() => void) | undefined;
  actions?: ConversationThreadListItemActions;
}

export function ConversationThreadListItemComposition(props: ConversationThreadListItemProps) {
  return (
    <ConfiguredThreadListItem
      actions={props.actions ?? { rename: true, archive: true, unarchive: true, delete: true }}
      onNavigate={props.onNavigate}
    />
  );
}

/** Presentation only: all actions and navigation remain assistant-ui-owned. */
function ConfiguredThreadListItem({
  actions,
  onNavigate,
}: {
  onNavigate?: (() => void) | undefined;
  actions: ConversationThreadListItemActions;
}) {
  const isRunning = useAuiState((s) => s.threadListItem.isRunning);
  const labels = useLocale('threadList');
  const [isRenaming, setIsRenaming] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (isRenaming || !restoreFocus.current) return;
    restoreFocus.current = false;
    triggerRef.current?.focus();
  }, [isRenaming]);
  return (
    <ThreadListItemPrimitive.Root
      data-agent-ui-owned=''
      data-slot='aui_thread-list-item'
      className='group/thread-list-item hover:bg-muted focus-visible:bg-muted data-active:bg-muted has-focus-visible:bg-muted has-data-[state=open]:bg-muted relative flex h-8 items-center rounded-md transition-colors focus-visible:outline-none'
    >
      {isRenaming ? (
        <ThreadRename
          label={labels.rename}
          onDone={(focus) => {
            restoreFocus.current = focus;
            setIsRenaming(false);
          }}
        />
      ) : (
        <ThreadListItemPrimitive.Trigger
          ref={triggerRef}
          onClick={onNavigate}
          data-agent-ui-owned=''
          data-slot='aui_thread-list-item-trigger'
          className='focus-visible:ring-ring/50 flex h-full min-w-0 flex-1 items-center rounded-md px-2.5 text-start text-sm outline-none group-hover/thread-list-item:pe-9 group-has-focus-visible/thread-list-item:pe-9 group-has-data-[state=open]/thread-list-item:pe-9 group-data-active/thread-list-item:pe-9 focus-visible:ring-1'
        >
          {isRunning && (
            <Loader2Icon aria-hidden className='text-muted-foreground me-1.5 size-3.5 shrink-0 animate-spin' />
          )}
          <span data-agent-ui-owned='' data-slot='aui_thread-list-item-title' className='min-w-0 flex-1 truncate'>
            <ThreadListItemPrimitive.Title fallback={labels.newChat} />
          </span>
          {isRunning && (
            <span data-agent-ui-owned='' className='sr-only'>
              {labels.running}
            </span>
          )}
        </ThreadListItemPrimitive.Trigger>
      )}
      <ThreadItemMenu actions={actions} isRenaming={isRenaming} onRename={() => setIsRenaming(true)} />
    </ThreadListItemPrimitive.Root>
  );
}
