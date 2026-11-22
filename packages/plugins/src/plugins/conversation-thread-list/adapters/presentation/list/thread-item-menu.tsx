'use client';
import { useLocale } from '../../../../../locale.js';
import { ThreadListItemMorePrimitive, ThreadListItemPrimitive, useAui, useAuiState } from '@assistant-ui/react';
import { ArchiveIcon, ArchiveRestoreIcon, MoreHorizontalIcon, PencilIcon, TrashIcon } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '../../../../../internal/adapters-generated/assistant-ui/components/ui/button.js';
import { usePortalContainer } from '../../../../../internal/style-boundary/AgentUIRoot.js';
import { deleteThreadWithSelectionRecovery } from '../../../../../internal/thread-delete-recovery.js';
import type { ConversationThreadListItemActions } from './thread-item.js';

export function ThreadItemMenu({
  actions,
  isRenaming,
  onRename,
}: {
  actions: ConversationThreadListItemActions;
  isRenaming: boolean;
  onRename: () => void;
}) {
  const portalContainer = usePortalContainer();
  const aui = useAui();
  const archived = useAuiState((s) => s.threadListItem.status === 'archived');
  const labels = useLocale('threadList');
  const renameMenuClose = useRef(false);
  const itemClass =
    'hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none';
  return (
    (actions.rename || (archived ? actions.unarchive : actions.archive) || actions.delete) && (
      <ThreadListItemMorePrimitive.Root sharedFocusGroup>
        <ThreadListItemMorePrimitive.Trigger asChild>
          <Button
            variant='ghost'
            size='icon'
            data-slot='agent-ui-thread-action-more'
            className='data-[state=open]:bg-accent absolute end-1.5 top-1/2 size-6 -translate-y-1/2 p-0 opacity-0 group-hover/thread-list-item:opacity-100 group-has-focus-visible/thread-list-item:opacity-100 group-data-active/thread-list-item:opacity-100 data-[state=open]:opacity-100'
          >
            <MoreHorizontalIcon aria-hidden className='size-3.5' />
            <span data-agent-ui-owned='' className='sr-only'>
              {labels.moreOptions}
            </span>
          </Button>
        </ThreadListItemMorePrimitive.Trigger>
        {/* Retire the closing menu before focusing the inline editor. Its exit
              animation must not retain a focus scope over the next interaction. */}
        {portalContainer !== null && !isRenaming && (
          <ThreadListItemMorePrimitive.Content
            side='right'
            align='start'
            sideOffset={6}
            portalProps={portalContainer === undefined ? undefined : { container: portalContainer }}
            onCloseAutoFocus={(event) => {
              if (!renameMenuClose.current) return;
              renameMenuClose.current = false;
              event.preventDefault();
            }}
            data-slot='agent-ui-thread-action-menu'
            className='bg-popover text-popover-foreground data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:animate-out data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-32 overflow-hidden rounded-xl border p-1.5'
          >
            {actions.rename && (
              <ThreadListItemMorePrimitive.Item
                data-slot='agent-ui-thread-action-rename'
                className={itemClass}
                onSelect={() => {
                  renameMenuClose.current = true;
                  onRename();
                }}
              >
                <PencilIcon aria-hidden className='size-4' />
                {labels.rename}
              </ThreadListItemMorePrimitive.Item>
            )}
            {!archived && actions.archive && (
              <ThreadListItemPrimitive.Archive asChild>
                <ThreadListItemMorePrimitive.Item data-slot='agent-ui-thread-action-archive' className={itemClass}>
                  <ArchiveIcon aria-hidden className='size-4' />
                  {labels.archive}
                </ThreadListItemMorePrimitive.Item>
              </ThreadListItemPrimitive.Archive>
            )}
            {archived && actions.unarchive && (
              <ThreadListItemPrimitive.Unarchive asChild>
                <ThreadListItemMorePrimitive.Item data-slot='agent-ui-thread-action-unarchive' className={itemClass}>
                  <ArchiveRestoreIcon aria-hidden className='size-4' />
                  {labels.unarchive}
                </ThreadListItemMorePrimitive.Item>
              </ThreadListItemPrimitive.Unarchive>
            )}
            {actions.delete && (
              <ThreadListItemMorePrimitive.Item
                data-slot='agent-ui-thread-action-delete'
                onSelect={() => {
                  void deleteThreadWithSelectionRecovery(aui.threadListItem.getState().id, {
                    getActiveId: () => aui.threads.getState().mainThreadId,
                    subscribe: (listener) => aui.subscribe(listener),
                    delete: () => aui.threadListItem.delete(),
                    select: (id) => aui.threads.switchToThread(id),
                    isActiveEmpty: () =>
                      !aui.thread.getState().isRunning &&
                      aui.thread.getState().messages.length === 0 &&
                      aui.composer.getState().isEmpty,
                  }).catch(() => {
                    /* The canonical action already reports errors. */
                  });
                }}
                className='text-destructive hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none'
              >
                <TrashIcon aria-hidden className='size-4' />
                {labels.delete}
              </ThreadListItemMorePrimitive.Item>
            )}
          </ThreadListItemMorePrimitive.Content>
        )}
      </ThreadListItemMorePrimitive.Root>
    )
  );
}
