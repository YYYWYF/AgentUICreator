import { describe, expect, it } from "vitest";

import type { AgentMessage } from "../framework/contracts/ui-plugin";
import {
  createConversationService,
  type ConversationDataSource,
  type ConversationDetail,
} from "../services/conversations";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function message(id: string): AgentMessage {
  return {
    id,
    producer: { type: "root" },
    role: "assistant",
    content: id,
  };
}

describe("ConversationService", () => {
  it("projects initial list loading through ready", async () => {
    const list = deferred<Array<{ id: string; title: string }>>();
    const dataSource: ConversationDataSource = {
      list: () => list.promise,
      get: async () => ({ id: "unused", title: "Unused", messages: [] }),
    };
    const service = createConversationService({
      dataSource,
    });
    const request = service.refresh();
    expect(service.getSnapshot().listStatus).toBe("loading");
    list.resolve([{ id: "conversation-1", title: "Conversation 1" }]);
    await request;
    expect(service.getSnapshot()).toMatchObject({
      listStatus: "ready",
      conversations: [{ id: "conversation-1", title: "Conversation 1" }],
    });
  });

  it("selects history, then returns to live", async () => {
    const dataSource: ConversationDataSource = {
      list: async () => [],
      get: async (id) => ({ id, title: id, messages: [message(id)] }),
    };
    const service = createConversationService({
      dataSource,
    });
    const request = service.selectConversation("conversation-1");
    expect(service.getSnapshot()).toMatchObject({
      mode: "history",
      activeConversationId: "conversation-1",
      detailStatus: "loading",
    });
    await request;
    expect(service.getSnapshot()).toMatchObject({
      detailStatus: "ready",
      historyMessages: [expect.objectContaining({ id: "conversation-1" })],
    });
    service.showLiveConversation();
    expect(service.getSnapshot()).toMatchObject({
      mode: "live",
      detailStatus: "idle",
      historyMessages: [],
    });
    expect(service.getSnapshot().activeConversationId).toBeUndefined();
  });

  it("keeps the authoritative snapshot and records the failed history id", async () => {
    const dataSource: ConversationDataSource = {
      list: async () => [],
      get: async () => {
        throw new Error("Conversation API request failed (500)");
      },
    };
    const service = createConversationService({
      dataSource,
    });
    const liveSnapshot = service.getSnapshot();

    await service.selectConversation("history-broken");

    expect(service.getSnapshot()).toMatchObject({
      ...liveSnapshot,
      detailStatus: "error",
      detailError: "Conversation API request failed (500)",
      detailErrorConversationId: "history-broken",
    });
    expect(service.getSnapshot().mode).toBe("live");
    expect(service.getSnapshot().activeConversationId).toBeUndefined();
  });

  it("clears detail errors when a history retry succeeds", async () => {
    let shouldFail = true;
    const dataSource: ConversationDataSource = {
      list: async () => [],
      get: async (id) => {
        if (shouldFail) throw new Error("temporary failure");
        return { id, title: id, messages: [message(id)] };
      },
    };
    const service = createConversationService({
      dataSource,
    });

    await service.selectConversation("history-retry");
    shouldFail = false;
    await service.selectConversation("history-retry");

    expect(service.getSnapshot()).toMatchObject({
      mode: "history",
      activeConversationId: "history-retry",
      detailStatus: "ready",
      historyMessages: [expect.objectContaining({ id: "history-retry" })],
    });
    expect(service.getSnapshot().detailError).toBeUndefined();
    expect(service.getSnapshot().detailErrorConversationId).toBeUndefined();
  });

  it("prevents a late detail response from overwriting a newer selection", async () => {
    const requests = new Map<string, ReturnType<typeof deferred<ConversationDetail>>>();
    const dataSource: ConversationDataSource = {
      list: async () => [],
      get: (id) => {
        const request = deferred<ConversationDetail>();
        requests.set(id, request);
        return request.promise;
      },
    };
    const service = createConversationService({
      dataSource,
    });
    const first = service.selectConversation("A");
    const second = service.selectConversation("B");
    requests.get("B")?.resolve({ id: "B", title: "B", messages: [message("B")] });
    await second;
    requests.get("A")?.resolve({ id: "A", title: "A", messages: [message("A")] });
    await first;
    expect(service.getSnapshot()).toMatchObject({
      activeConversationId: "B",
      historyMessages: [expect.objectContaining({ id: "B" })],
    });
  });

  it("resets history state for a Runtime-owned new conversation", async () => {
    const dataSource: ConversationDataSource = {
      list: async () => [],
      get: async (id) => ({ id, title: id, messages: [message(id)] }),
    };
    const service = createConversationService({
      dataSource,
    });
    await service.selectConversation("history");
    service.resetForNewConversation();
    expect(service.getSnapshot().mode).toBe("live");
    expect(service.getSnapshot()).toMatchObject({
      mode: "live",
      activeConversationId: undefined,
      historyMessages: [],
      detailStatus: "idle",
      detailError: undefined,
      detailErrorConversationId: undefined,
    });
  });

  it("clears detail errors when returning to live or creating a new conversation", async () => {
    const dataSource: ConversationDataSource = {
      list: async () => [],
      get: async () => {
        throw new Error("failed");
      },
    };
    const service = createConversationService({
      dataSource,
    });

    await service.selectConversation("history");
    service.showLiveConversation();
    expect(service.getSnapshot().detailErrorConversationId).toBeUndefined();

    await service.selectConversation("history");
    service.resetForNewConversation();
    expect(service.getSnapshot()).toMatchObject({
      mode: "live",
      detailStatus: "idle",
    });
    expect(service.getSnapshot().detailError).toBeUndefined();
    expect(service.getSnapshot().detailErrorConversationId).toBeUndefined();
  });

  it("aborts list and detail requests when disposed", async () => {
    const signals: AbortSignal[] = [];
    const never = (signal?: AbortSignal) => new Promise<never>((_resolve, reject) => {
      if (signal !== undefined) signals.push(signal);
      signal?.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    });
    const dataSource: ConversationDataSource = {
      list: ({ signal } = {}) => never(signal),
      get: (_id, { signal } = {}) => never(signal),
    };
    const service = createConversationService({
      dataSource,
    });
    const listRequest = service.refresh();
    const detailRequest = service.selectConversation("history");
    service.dispose();
    await Promise.all([listRequest, detailRequest]);
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});
