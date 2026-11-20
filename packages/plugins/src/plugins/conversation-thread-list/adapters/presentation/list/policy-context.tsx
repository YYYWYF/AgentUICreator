'use client';

import { createContext, useContext, type ComponentType } from 'react';
import {
  ConversationThreadListItem,
  useSidebarNavigation,
  useConversation,
  type ConversationThreadListItemProps,
} from '../../../../../public.js';

export const ThreadListOptionsContext = /* @__PURE__ */ createContext<{
  itemProps?: ConversationThreadListItemProps | undefined;
  components?: { ThreadListItem?: ComponentType } | undefined;
}>({});

export function PolicyThreadListItem() {
  const onNavigate = useSidebarNavigation();
  const { itemProps } = useContext(ThreadListOptionsContext);
  const disabledByConversation = useConversation((s) => s.threadListItem.custom?.agentUiDisabled === true);
  const disabled = disabledByConversation;

  return (
    <div className='contents' aria-disabled={disabled || undefined} inert={disabled || undefined}>
      <ConversationThreadListItem
        onNavigate={onNavigate}
        actions={{ rename: true, archive: true, unarchive: true, delete: true }}
        {...itemProps}
      />
    </div>
  );
}
