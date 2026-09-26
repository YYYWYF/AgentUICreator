"use client";

import {
  type ConversationThreadListItemLabels,
  ConversationIf,
  ConversationThreadListItem,
  ConversationThreadListItemByIndex,
  ConversationThreadListNew,
  ConversationThreadListRoot,
  ConversationThreadListSearch,
  Skeleton,
  useConversationState,
  useConversationThreadListGroups,
} from "@agent-ui/react";
import { createContext, Fragment, useContext, useState, type FC } from "react";

const ThreadListLabelsContext = createContext<ConversationThreadListItemLabels | undefined>(undefined);

function PolicyThreadListItem() {
  const labels = useContext(ThreadListLabelsContext);
  if (labels === undefined) throw new Error("Thread List labels are missing.");
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
        actions={{ rename: false, archive: false, delete: true }}
        labels={labels}
      />
    </div>
  );
}

const PolicyThreadListSkeleton: FC = () => {
  return (
    <div className="flex flex-col gap-0.5">
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          role="status"
          aria-label="Loading threads"
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
  const { threadIds, filteredIndices, groups } = useConversationThreadListGroups(searchQuery);
  const query = searchQuery.trim();

  if (query && filteredIndices.length === 0) {
    return (
      <div
        data-slot="aui_thread-list-empty"
        className="text-muted-foreground px-2.5 py-4 text-sm"
      >
        No threads found
      </div>
    );
  }

  if (!groups) {
    return filteredIndices.map((index) => (
      <ConversationThreadListItemByIndex
        key={threadIds[index]}
        index={index}
        components={{ ThreadListItem: PolicyThreadListItem }}
      />
    ));
  }

  return groups.map((group) => (
    <Fragment key={group.label}>
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
          components={{ ThreadListItem: PolicyThreadListItem }}
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

export function PolicyThreadList({ labels }: { labels: ConversationThreadListItemLabels }) {
  const [search, setSearch] = useState("");
  const hasThreads = useConversationState((s) => s.threads.threadIds.length > 0);

  return (
    <ThreadListLabelsContext.Provider value={labels}>
      <ConversationThreadListRoot>
        <ConversationThreadListNew />
        {hasThreads && (
          <ConversationThreadListSearch value={search} onValueChange={setSearch} />
        )}
        <PolicyThreadListItems searchQuery={hasThreads ? search : ""} />
      </ConversationThreadListRoot>
    </ThreadListLabelsContext.Provider>
  );
}
