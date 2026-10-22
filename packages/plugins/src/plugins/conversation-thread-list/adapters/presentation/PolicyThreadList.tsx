"use client";

import {
  useAgentUILocale,
  type ConversationThreadListItemLabels,
  type ConversationThreadListItemProps,
  useAgentUISidebarNavigation,
  ConversationIf,
  ConversationThreadListItem,
  ConversationThreadListItemByIndex,
  ConversationThreadListRoot,
  ConversationThreadListSearch,
  Skeleton,
  useConversationState,
  useConversationThreadListGroups,
} from "../../../../public.js";
import { createContext, Fragment, useContext, useState, type FC, type ComponentProps, type ComponentType } from "react";

const ThreadListOptionsContext = /* @__PURE__ */ createContext<{ itemProps?: ConversationThreadListItemProps | undefined; components?: {ThreadListItem?: ComponentType} | undefined }>({});
const ThreadListLabelsContext = /* @__PURE__ */ createContext<ConversationThreadListItemLabels | undefined>(undefined);

function PolicyThreadListItem() {
  const onNavigate = useAgentUISidebarNavigation();
  const labels = useContext(ThreadListLabelsContext);
  if (labels === undefined) throw new Error("Thread List labels are missing.");
  const {itemProps} = useContext(ThreadListOptionsContext);
  const disabledByConversation = useConversationState(
    (s) => s.threadListItem.custom?.agentUiDisabled === true,
  );
  const disabled = disabledByConversation;

  return (
    <div
      className="contents"
      aria-disabled={disabled || undefined}
      inert={disabled || undefined}
    >
      <ConversationThreadListItem
        onNavigate={onNavigate}
        actions={{ rename: false, archive: false, delete: true }}
        labels={labels}
        {...itemProps}
      />
    </div>
  );
}

const PolicyThreadListSkeleton: FC = () => {
  const messages = useAgentUILocale("threadList");
  return (
    <div className="flex flex-col gap-0.5">
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          role="status"
          aria-label={messages.loading}
          data-slot="aui_thread-list-skeleton-wrapper"
          className="flex h-8 items-center px-2.5"
        >
          <Skeleton
            data-slot="aui_thread-list-skeleton"
            className="h-3.5 w-full"
          />
        </div>
      ))}
    </div>
  );
};

const PolicyThreadListItemGroups: FC<{ searchQuery?: string }> = ({
  searchQuery = "",
}) => {
  const messages = useAgentUILocale("threadList");
  const {components} = useContext(ThreadListOptionsContext);
  const { threadIds, filteredIndices, groups } = useConversationThreadListGroups(searchQuery);

  if (filteredIndices.length === 0) {
    return (
      <div
        data-slot="aui_thread-list-empty"
        className="text-muted-foreground px-2.5 py-4 text-sm"
      >
        {messages.empty}
      </div>
    );
  }

  if (!groups) {
    return filteredIndices.map((index) => (
      <ConversationThreadListItemByIndex
        key={threadIds[index]}
        index={index}
        components={{ ThreadListItem: components?.ThreadListItem ?? PolicyThreadListItem }}
      />
    ));
  }

  return groups.map((group) => (
    <Fragment key={group.id}>
      <div
        data-slot="aui_thread-list-group-label"
        className="text-muted-foreground px-2.5 pt-3 pb-1 text-xs font-medium"
      >
        {group.label}
      </div>
      {group.indices.map((index) => (
        <ConversationThreadListItemByIndex
          key={threadIds[index]}
          index={index}
          components={{ ThreadListItem: components?.ThreadListItem ?? PolicyThreadListItem }}
        />
      ))}
    </Fragment>
  ));
};

const PolicyThreadListItems: FC<{ searchQuery?: string }> = ({
  searchQuery = "",
}) => {
  return (
    <div
      data-slot="aui_thread-list-items"
      className="flex flex-col gap-0.5"
    >
      <ConversationIf condition={(s) => s.threads.isLoading}>
        <PolicyThreadListSkeleton />
      </ConversationIf>
      <ConversationIf condition={(s) => !s.threads.isLoading}>
        <PolicyThreadListItemGroups searchQuery={searchQuery} />
      </ConversationIf>
    </div>
  );
};

export interface PolicyThreadListProps {
  labels: ConversationThreadListItemLabels;
  rootProps?: ComponentProps<typeof ConversationThreadListRoot>;
  /** Disabling search also removes its query from list filtering. */
  showSearch?: boolean;
  searchProps?: Partial<ComponentProps<typeof ConversationThreadListSearch>>;
  itemProps?: ConversationThreadListItemProps;
  components?: { ThreadListItem?: ComponentType };
}
export function PolicyThreadList({ labels, rootProps, showSearch = true, searchProps, itemProps, components }: PolicyThreadListProps) {
  const messages = useAgentUILocale("threadList");
  const [search, setSearch] = useState("");
  const hasThreads = useConversationState((s) => s.threads.threadIds.length > 0);

  return (
    <ThreadListOptionsContext.Provider value={{itemProps,components}}><ThreadListLabelsContext.Provider value={labels}>
      <ConversationThreadListRoot {...rootProps}>
        {showSearch && hasThreads && (
          <ConversationThreadListSearch placeholder={messages.search} aria-label={messages.search} {...searchProps} value={searchProps?.value ?? search} onValueChange={value => { setSearch(value); searchProps?.onValueChange?.(value); }} />
        )}
        <PolicyThreadListItems searchQuery={showSearch && hasThreads ? (searchProps?.value ?? search) : ""} />
      </ConversationThreadListRoot>
    </ThreadListLabelsContext.Provider></ThreadListOptionsContext.Provider>
  );
}
