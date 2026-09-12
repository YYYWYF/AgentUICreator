import type { AgentMessage } from "../../framework/contracts/ui-plugin";
import type { ConversationDetail, ConversationSummary } from "./contract";
import type { ConversationDataSource } from "./data-source";

export const AGENT_UI_CONVERSATION_SERVICE = "agent-ui.conversations";

export type ConversationViewMode = "live" | "history";
export type ConversationLoadStatus = "idle" | "loading" | "ready" | "error";

export interface ConversationSnapshot {
  mode: ConversationViewMode;
  conversations: ConversationSummary[];
  activeConversationId?: string | undefined;
  historyMessages: AgentMessage[];
  listStatus: ConversationLoadStatus;
  detailStatus: ConversationLoadStatus;
  listError?: string | undefined;
  detailError?: string | undefined;
  detailErrorConversationId?: string | undefined;
}

export interface AgentUIConversationService {
  getSnapshot(): ConversationSnapshot;
  subscribe(listener: () => void): () => void;
  refresh(): Promise<void>;
  selectConversation(id: string): Promise<ConversationDetail | undefined>;
  showLiveConversation(): void;
  startNewConversation(): Promise<void>;
}

export interface ConversationControllerOptions {
  dataSource: ConversationDataSource;
  startNewConversation(): Promise<void>;
}

export const EMPTY_CONVERSATION_SNAPSHOT: ConversationSnapshot = {
  mode: "live",
  conversations: [],
  historyMessages: [],
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

export function createConversationController({
  dataSource,
  startNewConversation,
}: ConversationControllerOptions): AgentUIConversationService & {
  dispose(): void;
} {
  let snapshot = EMPTY_CONVERSATION_SNAPSHOT;
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

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async refresh() {
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
        if (listRequest !== request || request.signal.aborted || disposed) return;
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
        ) return;
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
        historyMessages: [],
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
          historyMessages: detail.messages,
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
        ) return undefined;
        update({
          ...previousSnapshot,
          detailStatus: "error",
          detailError: errorMessage(error),
          detailErrorConversationId: normalizedId,
        });
        return undefined;
      } finally {
        if (detailRequest === request) detailRequest = undefined;
      }
    },
    showLiveConversation() {
      if (disposed) return;
      detailRequest?.abort();
      detailRequest = undefined;
      update({
        ...snapshot,
        mode: "live",
        activeConversationId: undefined,
        historyMessages: [],
        detailStatus: "idle",
        detailError: undefined,
        detailErrorConversationId: undefined,
      });
    },
    async startNewConversation() {
      if (disposed) return;
      await startNewConversation();
      if (disposed) return;
      detailRequest?.abort();
      detailRequest = undefined;
      update({
        ...snapshot,
        mode: "live",
        activeConversationId: undefined,
        historyMessages: [],
        detailStatus: "idle",
        detailError: undefined,
        detailErrorConversationId: undefined,
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      listRequest?.abort();
      detailRequest?.abort();
      listRequest = undefined;
      detailRequest = undefined;
      listeners.clear();
    },
  };
}

export function getConversationViewMessages(
  liveMessages: readonly AgentMessage[],
  snapshot: ConversationSnapshot,
): AgentMessage[] {
  return snapshot.mode === "history"
    ? [...snapshot.historyMessages]
    : [...liveMessages];
}

export type ChatVisibleMessage = Extract<
  AgentMessage,
  { role: "user" | "assistant" }
>;

/** Ordinary chat content; system and developer messages remain internal context. */
export function isChatVisibleMessage(
  message: AgentMessage,
): message is ChatVisibleMessage {
  return message.role === "user" || message.role === "assistant";
}

export function getVisibleConversationMessages(
  liveMessages: readonly AgentMessage[],
  snapshot: ConversationSnapshot,
): ChatVisibleMessage[] {
  return getConversationViewMessages(liveMessages, snapshot).filter(
    isChatVisibleMessage,
  );
}

declare module "../../framework/contracts/ui-plugin" {
  interface UIPluginServiceMap {
    [AGENT_UI_CONVERSATION_SERVICE]: AgentUIConversationService;
  }
}
