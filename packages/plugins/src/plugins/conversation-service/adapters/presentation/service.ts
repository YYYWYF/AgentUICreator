import { createConversationServiceThreadBinding } from "./thread-binding.js";
import type { ConversationThreadBindingFactory } from "@za38.03/agent-ui-runtime/plugin-api";
import type { ConversationDetail, ConversationSummary } from "./contract.js";
import type { ConversationDataSource } from "./data-source.js";

export const AGENT_UI_CONVERSATION_SERVICE = "agent-ui.conversations";

export type ConversationViewMode = "live" | "history";
export type ConversationLoadStatus = "idle" | "loading" | "ready" | "error";

export interface ConversationSnapshot {
  mode: ConversationViewMode;
  conversations: ConversationSummary[];
  activeConversationId?: string | undefined;
  activeConversation?: ConversationDetail | undefined;
  listStatus: ConversationLoadStatus;
  detailStatus: ConversationLoadStatus;
  listError?: string | undefined;
  detailError?: string | undefined;
  detailErrorConversationId?: string | undefined;
}

export interface ConversationService {
  getSnapshot(): ConversationSnapshot;
  subscribe(listener: () => void): () => void;
  refresh(): Promise<void>;
  deleteConversation(id: string): Promise<void>;
  renameConversation?(id: string, title: string): Promise<void>;
  archiveConversation?(id: string): Promise<void>;
  unarchiveConversation?(id: string): Promise<void>;
  selectConversation(id: string): Promise<ConversationDetail | undefined>;
  /** Independent per-thread history read; never cancels a sibling thread request. */
  loadConversation(id: string): Promise<ConversationDetail>;
  /** Business selection only; does not refetch history. */
  showConversation(id: string): void;
  /** Select the already-existing live conversation. */
  showLiveConversation(): void;
  /**
   * Synchronize Conversation Service state after the Runtime has created or
   * switched to a new conversation. This must not perform Runtime navigation.
   */
  resetForNewConversation(): void;
}

export interface ConversationServiceOptions {
  dataSource: ConversationDataSource;
}

export const EMPTY_CONVERSATION_SNAPSHOT: ConversationSnapshot = {
  mode: "live",
  conversations: [],
  listStatus: "idle",
  detailStatus: "idle",
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

export function createConversationService({
  dataSource,
}: ConversationServiceOptions): ConversationService & {
  dispose(): void;
} {
  let snapshot = EMPTY_CONVERSATION_SNAPSHOT;
  // Business detail observation only; messages in mounted runtimes remain upstream-owned.
  const historyReads = new Map<
    string,
    {
      status: ConversationLoadStatus;
      detail?: ConversationDetail;
      error?: string;
      request?: AbortController;
    }
  >();
  let listRequest: AbortController | undefined;
  let detailRequest: AbortController | undefined;
  let disposed = false;
  const listeners = new Set<() => void>();

  const emit = (): void => {
    if (!disposed) listeners.forEach((listener) => listener());
  };
  const update = (next: ConversationSnapshot): void => {
    if (disposed) return;
    snapshot = next;
    emit();
  };
  const resetToLiveState = (): void => {
    if (disposed) return;
    detailRequest?.abort();
    detailRequest = undefined;
    update({
      ...snapshot,
      mode: "live",
      activeConversationId: undefined,
      activeConversation: undefined,
      detailStatus: "idle",
      detailError: undefined,
      detailErrorConversationId: undefined,
    });
  };

  const changeConversation = async (
    id: string,
    patch: Partial<Pick<ConversationSummary, "title" | "status">>,
    persist: ((id: string) => Promise<void>) | undefined,
  ): Promise<void> => {
    const normalizedId = id.trim();
    if (!normalizedId) throw new Error("Conversation id must not be blank.");
    if (disposed) throw new Error("Conversation service was disposed.");
    if (persist === undefined)
      throw new Error("CONVERSATION_OPERATION_NOT_CONFIGURED");
    await persist(normalizedId);
    if (disposed) return;
    // A list request started before persistence completed must not undo the result.
    listRequest?.abort();
    listRequest = undefined;
    const read = historyReads.get(normalizedId);
    if (patch.title !== undefined && read?.detail !== undefined) {
      historyReads.set(normalizedId, {
        ...read,
        detail: { ...read.detail, title: patch.title },
      });
    }
    update({
      ...snapshot,
      conversations: snapshot.conversations.map((item) =>
        item.id === normalizedId ? { ...item, ...patch } : item,
      ),
      listStatus:
        snapshot.listStatus === "loading" ? "idle" : snapshot.listStatus,
      ...(snapshot.activeConversation?.id === normalizedId &&
      patch.title !== undefined
        ? {
            activeConversation: {
              ...snapshot.activeConversation,
              title: patch.title,
            },
          }
        : {}),
    });
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async renameConversation(id, title) {
      const normalizedTitle = title.trim();
      if (!normalizedTitle)
        throw new Error("Conversation title must not be blank.");
      await changeConversation(
        id,
        { title: normalizedTitle },
        dataSource.rename === undefined
          ? undefined
          : (key) => dataSource.rename!(key, normalizedTitle),
      );
    },
    async archiveConversation(id) {
      await changeConversation(
        id,
        { status: "archived" },
        dataSource.archive === undefined
          ? undefined
          : (key) => dataSource.archive!(key),
      );
    },
    async unarchiveConversation(id) {
      await changeConversation(
        id,
        { status: "regular" },
        dataSource.unarchive === undefined
          ? undefined
          : (key) => dataSource.unarchive!(key),
      );
    },
    async deleteConversation(id) {
      const normalizedId = id.trim();
      if (normalizedId.length === 0)
        throw new Error("Conversation id must not be blank.");
      if (disposed) throw new Error("Conversation service was disposed.");
      await dataSource.delete(normalizedId);
      // Invalidate observations only after persistence succeeds; navigation is upstream-owned.
      listRequest?.abort();
      listRequest = undefined;
      historyReads.get(normalizedId)?.request?.abort();
      historyReads.delete(normalizedId);
      const deletingActive = snapshot.activeConversationId === normalizedId;
      if (deletingActive) {
        detailRequest?.abort();
        detailRequest = undefined;
      }
      update({
        ...snapshot,
        conversations: snapshot.conversations.filter(
          (item) => item.id !== normalizedId,
        ),
        listStatus:
          snapshot.listStatus === "loading" ? "idle" : snapshot.listStatus,
        ...(deletingActive
          ? {
              mode: "live" as const,
              activeConversationId: undefined,
              activeConversation: undefined,
              detailStatus: "idle" as const,
              detailError: undefined,
              detailErrorConversationId: undefined,
            }
          : {}),
      });
    },
    async refresh() {
      if (disposed) return;
      listRequest?.abort();
      const request = new AbortController();
      listRequest = request;
      update({
        ...snapshot,
        listStatus: "loading",
        listError: undefined,
      });
      try {
        const conversations = await dataSource.list({ signal: request.signal });
        if (listRequest !== request || request.signal.aborted || disposed)
          return;
        update({
          ...snapshot,
          conversations,
          listStatus: "ready",
          listError: undefined,
        });
      } catch (error) {
        if (
          listRequest !== request ||
          request.signal.aborted ||
          disposed ||
          isAbortError(error)
        )
          return;
        update({
          ...snapshot,
          listStatus: "error",
          listError: errorMessage(error),
        });
      } finally {
        if (listRequest === request) listRequest = undefined;
      }
    },
    async selectConversation(id) {
      const normalizedId = id.trim();
      if (normalizedId.length === 0 || disposed) return undefined;
      detailRequest?.abort();
      const request = new AbortController();
      detailRequest = request;
      const previousSnapshot = snapshot;
      update({
        ...snapshot,
        mode: "history",
        activeConversationId: normalizedId,
        activeConversation: undefined,
        detailStatus: "loading",
        detailError: undefined,
        detailErrorConversationId: undefined,
      });
      try {
        const detail = await dataSource.get(normalizedId, {
          signal: request.signal,
        });
        if (detailRequest !== request || request.signal.aborted || disposed) {
          return undefined;
        }
        update({
          ...snapshot,
          activeConversation: detail,
          detailStatus: "ready",
          detailError: undefined,
          detailErrorConversationId: undefined,
        });
        return detail;
      } catch (error) {
        if (
          detailRequest !== request ||
          request.signal.aborted ||
          disposed ||
          isAbortError(error)
        )
          return undefined;
        const previousId = previousSnapshot.activeConversationId;
        const previousSummary = snapshot.conversations.find(
          (item) => item.id === previousId,
        );
        const previousWasDeleted =
          previousSnapshot.conversations.some(
            (item) => item.id === previousId,
          ) && previousSummary === undefined;
        update({
          ...snapshot,
          mode: previousWasDeleted ? "live" : previousSnapshot.mode,
          activeConversationId: previousWasDeleted ? undefined : previousId,
          activeConversation: previousWasDeleted
            ? undefined
            : previousSnapshot.activeConversation === undefined
              ? undefined
              : {
                  ...previousSnapshot.activeConversation,
                  title:
                    previousSummary?.title ??
                    previousSnapshot.activeConversation.title,
                },
          detailStatus: "error",
          detailError: errorMessage(error),
          detailErrorConversationId: normalizedId,
        });
        return undefined;
      } finally {
        if (detailRequest === request) detailRequest = undefined;
      }
    },
    async loadConversation(id) {
      if (disposed) throw new Error("Conversation service was disposed.");
      historyReads.get(id)?.request?.abort();
      const read = {
        status: "loading" as const,
        request: new AbortController(),
      };
      historyReads.set(id, read);
      if (snapshot.activeConversationId === id)
        update({
          ...snapshot,
          detailStatus: "loading",
          detailError: undefined,
          detailErrorConversationId: undefined,
        });
      try {
        const detail = await dataSource.get(id, {
          signal: read.request.signal,
        });
        if (
          disposed ||
          read.request.signal.aborted ||
          historyReads.get(id) !== read
        )
          throw new DOMException("History read invalidated.", "AbortError");
        historyReads.set(id, { status: "ready", detail });
        if (snapshot.activeConversationId === id)
          update({
            ...snapshot,
            activeConversation: detail,
            detailStatus: "ready",
            detailError: undefined,
            detailErrorConversationId: undefined,
          });
        return detail;
      } catch (error) {
        if (disposed || historyReads.get(id) !== read) throw error;
        historyReads.set(id, { status: "error", error: errorMessage(error) });
        if (snapshot.activeConversationId === id)
          update({
            ...snapshot,
            detailStatus: "error",
            detailError: errorMessage(error),
            detailErrorConversationId: id,
          });
        throw error;
      }
    },
    showConversation(id) {
      detailRequest?.abort();
      detailRequest = undefined;
      const read = historyReads.get(id);
      update({
        ...snapshot,
        mode: "history",
        activeConversationId: id,
        activeConversation: read?.detail,
        detailStatus: read?.status ?? "idle",
        detailError: read?.error,
        detailErrorConversationId: read?.status === "error" ? id : undefined,
      });
    },
    showLiveConversation() {
      resetToLiveState();
    },
    resetForNewConversation() {
      resetToLiveState();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      listRequest?.abort();
      detailRequest?.abort();
      listRequest = undefined;
      detailRequest = undefined;
      for (const read of historyReads.values()) read.request?.abort();
      historyReads.clear();
      listeners.clear();
    },
  };
}

declare module "@za38.03/agent-ui-runtime/contracts" {
  interface UIPluginServiceMap {
    [AGENT_UI_CONVERSATION_SERVICE]: ConversationService;
  }
}

/** The selected service implementation supplies the standard Runtime adapter. */
export function createConversationThreadBindingFactory(
  service: ConversationService,
): ConversationThreadBindingFactory {
  return (options) => {
    const binding = createConversationServiceThreadBinding(
      options.resumeProvider,
      options.initialThreadId ?? options.currentThreadId,
    );
    const detach = binding.attachConversationService(service);
    if (
      !options.initialThreadId &&
      options.currentThreadId &&
      !service
        .getSnapshot()
        .conversations.some((item) => item.id === options.currentThreadId)
    )
      binding.reserveThread?.(options.currentThreadId);
    return Object.assign(binding, { dispose: detach });
  };
}
