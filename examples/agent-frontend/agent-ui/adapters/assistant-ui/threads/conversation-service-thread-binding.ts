import type {
  AssistantUiLoadedThread,
  AssistantUiThreadBinding,
  AssistantUiThreadListItem,
  AssistantUiThreadListSnapshot,
} from "@agent-ui/runtime-assistant-ui";

import {
  projectConversationHistory,
} from "./conversation-history-projector";
import type {
  AgentUIConversationService,
  ConversationSnapshot,
  ConversationSummary,
} from "../../../../services/conversations";

export interface ConversationServiceAssistantUiThreadBinding<TState = unknown>
  extends AssistantUiThreadBinding<TState> {
  attachConversationService(
    service: AgentUIConversationService,
  ): () => void;
  captureLiveThread(snapshot: AssistantUiLoadedThread<TState>): void;
}

export class ConversationThreadSelectionDisabledError extends Error {
  readonly code = "AGENT_UI_CONVERSATION_SELECTION_DISABLED";

  constructor(threadId: string) {
    super(`Conversation "${threadId}" is disabled and cannot be selected.`);
    this.name = "ConversationThreadSelectionDisabledError";
  }
}

function sameCustom(
  left: Record<string, unknown> | undefined,
  right: Record<string, unknown> | undefined,
): boolean {
  const leftKeys = Object.keys(left ?? {});
  const rightKeys = Object.keys(right ?? {});
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => left?.[key] === right?.[key]);
}

function sameItem<TStatus extends "regular" | "archived">(
  left: AssistantUiThreadListItem<TStatus>,
  right: AssistantUiThreadListItem<TStatus>,
): boolean {
  return left.id === right.id &&
    left.status === right.status &&
    left.title === right.title &&
    sameCustom(left.custom, right.custom);
}

function sameItems<TStatus extends "regular" | "archived">(
  left: readonly AssistantUiThreadListItem<TStatus>[],
  right: readonly AssistantUiThreadListItem<TStatus>[],
): boolean {
  return left.length === right.length &&
    left.every((item, index) => {
      const other = right[index];
      return other !== undefined && sameItem(item, other);
    });
}

function sameListSnapshot(
  left: AssistantUiThreadListSnapshot,
  right: AssistantUiThreadListSnapshot,
): boolean {
  return left.isLoading === right.isLoading &&
    sameItems(left.threads, right.threads) &&
    sameItems(left.archivedThreads, right.archivedThreads);
}

function conversationCustom(item: ConversationSummary): Record<string, unknown> {
  return {
    ...(item.group === undefined ? {} : { group: item.group }),
    ...(item.updatedAt === undefined ? {} : { updatedAt: item.updatedAt }),
    ...(item.disabled === true ? { agentUiDisabled: true } : {}),
  };
}

function historyItem(
  item: ConversationSummary,
): AssistantUiThreadListItem<"regular"> {
  return {
    id: item.id,
    status: "regular",
    title: item.title,
    custom: conversationCustom(item),
  };
}

function createListSnapshot(
  liveThreadId: string,
  serviceSnapshot: ConversationSnapshot | undefined,
): AssistantUiThreadListSnapshot {
  const histories = serviceSnapshot?.conversations ?? [];
  return {
    isLoading: serviceSnapshot?.listStatus === "loading",
    threads: [
      {
        id: liveThreadId,
        status: "regular",
        title: "当前会话",
      },
      ...histories
        .filter((item) => item.id !== liveThreadId)
        .map(historyItem),
    ],
    archivedThreads: [],
  };
}

function emptyLoadedThread<TState>(): AssistantUiLoadedThread<TState> {
  return { messages: [] };
}

export function createConversationServiceAssistantUiThreadBinding<
  TState = unknown,
>(): ConversationServiceAssistantUiThreadBinding<TState> {
  let liveThreadId = crypto.randomUUID();
  let activeThreadId = liveThreadId;
  let liveThreadSnapshot = emptyLoadedThread<TState>();
  let activeThreadSnapshot = liveThreadSnapshot;
  let conversationService: AgentUIConversationService | undefined;
  let conversationSnapshot: ConversationSnapshot | undefined;
  let serviceUnsubscribe: (() => void) | undefined;
  let threadListSnapshot = createListSnapshot(liveThreadId, undefined);
  const listeners = new Set<() => void>();

  const emit = (): void => {
    listeners.forEach((listener) => listener());
  };

  const rebuildThreadListSnapshot = (): void => {
    const next = createListSnapshot(liveThreadId, conversationSnapshot);
    if (sameListSnapshot(threadListSnapshot, next)) return;
    threadListSnapshot = next;
    emit();
  };

  const updateConversationSnapshot = (
    next: ConversationSnapshot,
  ): void => {
    conversationSnapshot = next;
    rebuildThreadListSnapshot();
  };

  return {
    getThreadId: () => activeThreadId,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getThreadListSnapshot: () => threadListSnapshot,
    attachConversationService(service) {
      serviceUnsubscribe?.();
      conversationService = service;
      updateConversationSnapshot(service.getSnapshot());
      serviceUnsubscribe = service.subscribe(() => {
        updateConversationSnapshot(service.getSnapshot());
      });
      return () => {
        if (conversationService !== service) return;
        serviceUnsubscribe?.();
        serviceUnsubscribe = undefined;
        conversationService = undefined;
        conversationSnapshot = undefined;
        rebuildThreadListSnapshot();
      };
    },
    captureLiveThread(snapshot) {
      if (activeThreadId !== liveThreadId) return;
      if (
        snapshot.messages.length === 0 &&
        liveThreadSnapshot.messages.length > 0
      ) {
        return;
      }
      liveThreadSnapshot = snapshot;
      activeThreadSnapshot = snapshot;
    },
    async selectThread(threadId) {
      if (threadId === liveThreadId) {
        activeThreadId = liveThreadId;
        activeThreadSnapshot = liveThreadSnapshot;
        conversationService?.showLiveConversation();
        emit();
        return activeThreadSnapshot;
      }

      const summary = conversationService
        ?.getSnapshot()
        .conversations.find((item) => item.id === threadId);
      if (summary?.disabled === true) {
        throw new ConversationThreadSelectionDisabledError(threadId);
      }

      if (conversationService === undefined) return activeThreadSnapshot;
      const detail = await conversationService.selectConversation(threadId);
      if (detail === undefined) return activeThreadSnapshot;

      const loaded: AssistantUiLoadedThread<TState> = {
        messages: projectConversationHistory(detail.messages),
      };
      activeThreadId = threadId;
      activeThreadSnapshot = loaded;
      emit();
      return loaded;
    },
    async createNewThread() {
      if (conversationService !== undefined) {
        conversationService.resetForNewConversation();
      }

      const nextLiveThreadId = crypto.randomUUID();
      const nextLiveThreadSnapshot = emptyLoadedThread<TState>();

      liveThreadId = nextLiveThreadId;
      activeThreadId = nextLiveThreadId;
      liveThreadSnapshot = nextLiveThreadSnapshot;
      activeThreadSnapshot = nextLiveThreadSnapshot;
      rebuildThreadListSnapshot();
      return nextLiveThreadId;
    },
  };
}
