import type {
  ConversationLoadedThread,
  ConversationMessage,
  ConversationRunResume,
  ConversationThreadBinding,
  ConversationThreadListItem,
  ConversationThreadListSnapshot,
} from "@agent-ui/runtime-conversation";

import {
  projectConversationDetail,
} from "./conversation-history-projector";
import type {
  ConversationService,
  ConversationDetail,
  ConversationSnapshot,
  ConversationSummary,
} from "../../../services/conversations";
import { useMemo, useRef } from "react";

/** The application decides whether this exact persisted snapshot has a durable run. */
export type ConversationRunResumeProvider<TState = unknown> = (snapshot: {
  threadId: string;
  detail: ConversationDetail;
  messages: readonly ConversationMessage[];
  state?: TState | undefined;
}) => Promise<ConversationRunResume | undefined> | ConversationRunResume | undefined;

/** The generated Agent owns one binding for its mounted lifetime. */
export function useConversationServiceThreadBinding<TState = unknown>(
  resumeProvider?: ConversationRunResumeProvider<TState>,
  initialThreadId?: string,
): ConversationServiceThreadBinding<TState> {
  const providerRef = useRef(resumeProvider);
  providerRef.current = resumeProvider;
  return useMemo(() => createConversationServiceThreadBinding<TState>(
    snapshot => providerRef.current?.(snapshot), initialThreadId,
  ), []);
}

export interface ConversationServiceThreadBinding<TState = unknown>
  extends ConversationThreadBinding<TState> {
  getThreadListSnapshot(): ConversationThreadListSnapshot;
  selectThread(threadId: string): Promise<ConversationLoadedThread<TState>>;
  attachConversationService(service: ConversationService): () => void;

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
  left: ConversationThreadListItem<TStatus>,
  right: ConversationThreadListItem<TStatus>,
): boolean {
  return left.id === right.id &&
    left.status === right.status &&
    left.title === right.title &&
    sameCustom(left.custom, right.custom);
}

function sameItems<TStatus extends "regular" | "archived">(
  left: readonly ConversationThreadListItem<TStatus>[],
  right: readonly ConversationThreadListItem<TStatus>[],
): boolean {
  return left.length === right.length &&
    left.every((item, index) => {
      const other = right[index];
      return other !== undefined && sameItem(item, other);
    });
}

function sameListSnapshot(
  left: ConversationThreadListSnapshot,
  right: ConversationThreadListSnapshot,
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
): ConversationThreadListItem<"regular"> {
  return {
    id: item.id,
    status: "regular",
    title: item.title,
    custom: conversationCustom(item),
  };
}

function createListSnapshot(
  serviceSnapshot: ConversationSnapshot | undefined,
): ConversationThreadListSnapshot {
  const histories = serviceSnapshot?.conversations ?? [];
  return {
    isLoading: serviceSnapshot?.listStatus === "loading",
    threads: histories.map(historyItem),
    archivedThreads: [],
  };
}

function emptyLoadedThread<TState>(): ConversationLoadedThread<TState> {
  return { messages: [] };
}

export function createConversationServiceThreadBinding<
  TState = unknown,
>(resumeProvider?: ConversationRunResumeProvider<TState>, initialThreadId?: string): ConversationServiceThreadBinding<TState> {
  let activeThreadId: string = initialThreadId ?? crypto.randomUUID();
  const ephemeralThreadIds = new Set<string>(initialThreadId === undefined ? [activeThreadId] : []);
  let conversationService: ConversationService | undefined;
  let serviceUnsubscribe: (() => void) | undefined;
  let threadListSnapshot = createListSnapshot(undefined);
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(listener => listener());
  const hasPersistedThread = (id: string) =>
    conversationService?.getSnapshot().conversations.some(item => item.id === id) === true;
  const reconcileEphemeralThreads = () => {
    for (const id of ephemeralThreadIds) {
      if (hasPersistedThread(id)) ephemeralThreadIds.delete(id);
    }
  };
  const rebuild = () => {
    reconcileEphemeralThreads();
    const next = createListSnapshot(conversationService?.getSnapshot());
    if (sameListSnapshot(threadListSnapshot, next)) return;
    threadListSnapshot = next;
    emit();
  };
  const getThreadIsDisabled = (id: string) => conversationService?.getSnapshot().conversations.find(item => item.id === id)?.disabled === true;
  const loadThread = async (id: string): Promise<ConversationLoadedThread<TState>> => {
    if (getThreadIsDisabled(id)) throw new ConversationThreadSelectionDisabledError(id);
    if (ephemeralThreadIds.has(id) && !hasPersistedThread(id)) return emptyLoadedThread<TState>();
    ephemeralThreadIds.delete(id);
    if (conversationService === undefined) throw new Error("Conversation service is unavailable.");
    const detail = await conversationService.loadConversation(id);
    const messages = projectConversationDetail(detail);
    const state = detail.agentState as TState | undefined;
    const resume = await resumeProvider?.({ threadId: id, detail, messages, state });
    return {
      messages,
      ...(state === undefined ? {} : { state }),
      ...(resume === undefined ? {} : { resume }),
    };
  };
  const activateThread = (id: string) => {
    if (activeThreadId === id) return;
    activeThreadId = id;
    if (ephemeralThreadIds.has(id) && !hasPersistedThread(id)) {
      conversationService?.showLiveConversation();
    } else {
      ephemeralThreadIds.delete(id);
      conversationService?.showConversation(id);
    }
    emit();
  };
  return {
    getThreadId: () => activeThreadId,
    getIsDisabled: () => getThreadIsDisabled(activeThreadId),
    getThreadIsDisabled,
    loadThread,
    activateThread,
    reserveThread: id => { ephemeralThreadIds.add(id); },
    async initializeThread(id) {
      // Reserve identity only; the first AG-UI request creates the backend record.
      ephemeralThreadIds.add(id);
      return id;
    },
    async deleteThread(id) {
      if (ephemeralThreadIds.has(id) && !hasPersistedThread(id)) {
        ephemeralThreadIds.delete(id);
        return;
      }
      if (conversationService === undefined) throw new Error("Conversation service is unavailable.");
      await conversationService.deleteConversation(id);
      ephemeralThreadIds.delete(id);
    },
    async getThreadMetadata(id) {
      const summary = conversationService?.getSnapshot().conversations.find(item => item.id === id);
      if (summary !== undefined) return historyItem(summary);
      if (conversationService === undefined) throw new Error("Conversation service is unavailable.");
      const detail = await conversationService.loadConversation(id);
      return { id, status: "regular", title: detail.title };
    },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getThreadListSnapshot: () => threadListSnapshot,
    attachConversationService(service) {
      serviceUnsubscribe?.();
      conversationService = service;
      rebuild();
      serviceUnsubscribe = service.subscribe(rebuild);
      return () => {
        if (conversationService !== service) return;
        serviceUnsubscribe?.();
        serviceUnsubscribe = undefined;
        conversationService = undefined;
        rebuild();
      };
    },
    async selectThread(id) {
      const loaded = await loadThread(id);
      activateThread(id);
      return loaded;
    },
    async createNewThread() {
      const id = crypto.randomUUID();
      ephemeralThreadIds.add(id);
      activateThread(id);
      return id;
    },
  };
}
