import { describe, expect, it } from "vitest";

import type { AgentMessage } from "../framework/contracts/ui-plugin";
import {
  createConversationController,
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

describe("ConversationController", () => {
  it("projects initial list loading through ready", async () => {
    const list = deferred<Array<{ id: string; title: string }>>();
    const dataSource: ConversationDataSource = {
      list: () => list.promise,
      get: async () => ({ id: "unused", title: "Unused", messages: [] }),
    };
    const controller = createConversationController({
      dataSource,
    });
    const request = controller.refresh();
    expect(controller.getSnapshot().listStatus).toBe("loading");
    list.resolve([{ id: "conversation-1", title: "Conversation 1" }]);
    await request;
    expect(controller.getSnapshot()).toMatchObject({
      listStatus: "ready",
      conversations: [{ id: "conversation-1", title: "Conversation 1" }],
    });
  });

  it("selects history, then returns to live", async () => {
    const dataSource: ConversationDataSource = {
      list: async () => [],
      get: async (id) => ({ id, title: id, messages: [message(id)] }),
    };
    const controller = createConversationController({
      dataSource,
    });
    const request = controller.selectConversation("conversation-1");
    expect(controller.getSnapshot()).toMatchObject({
      mode: "history",
      activeConversationId: "conversation-1",
      detailStatus: "loading",
    });
    await request;
    expect(controller.getSnapshot()).toMatchObject({
      detailStatus: "ready",
      historyMessages: [expect.objectContaining({ id: "conversation-1" })],
    });
    controller.showLiveConversation();
    expect(controller.getSnapshot()).toMatchObject({
      mode: "live",
      detailStatus: "idle",
      historyMessages: [],
    });
    expect(controller.getSnapshot().activeConversationId).toBeUndefined();
  });

  it("keeps the authoritative snapshot and records the failed history id", async () => {
    const dataSource: ConversationDataSource = {
      list: async () => [],
      get: async () => {
        throw new Error("Conversation API request failed (500)");
      },
    };
    const controller = createConversationController({
      dataSource,
    });
    const liveSnapshot = controller.getSnapshot();

    await controller.selectConversation("history-broken");

    expect(controller.getSnapshot()).toMatchObject({
      ...liveSnapshot,
      detailStatus: "error",
      detailError: "Conversation API request failed (500)",
      detailErrorConversationId: "history-broken",
    });
    expect(controller.getSnapshot().mode).toBe("live");
    expect(controller.getSnapshot().activeConversationId).toBeUndefined();
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
    const controller = createConversationController({
      dataSource,
    });

    await controller.selectConversation("history-retry");
    shouldFail = false;
    await controller.selectConversation("history-retry");

    expect(controller.getSnapshot()).toMatchObject({
      mode: "history",
      activeConversationId: "history-retry",
      detailStatus: "ready",
      historyMessages: [expect.objectContaining({ id: "history-retry" })],
    });
    expect(controller.getSnapshot().detailError).toBeUndefined();
    expect(controller.getSnapshot().detailErrorConversationId).toBeUndefined();
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
    const controller = createConversationController({
      dataSource,
    });
    const first = controller.selectConversation("A");
    const second = controller.selectConversation("B");
    requests.get("B")?.resolve({ id: "B", title: "B", messages: [message("B")] });
    await second;
    requests.get("A")?.resolve({ id: "A", title: "A", messages: [message("A")] });
    await first;
    expect(controller.getSnapshot()).toMatchObject({
      activeConversationId: "B",
      historyMessages: [expect.objectContaining({ id: "B" })],
    });
  });

  it("resets history state for a Runtime-owned new conversation", async () => {
    const dataSource: ConversationDataSource = {
      list: async () => [],
      get: async (id) => ({ id, title: id, messages: [message(id)] }),
    };
    const controller = createConversationController({
      dataSource,
    });
    await controller.selectConversation("history");
    controller.resetForNewConversation();
    expect(controller.getSnapshot().mode).toBe("live");
    expect(controller.getSnapshot()).toMatchObject({
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
    const controller = createConversationController({
      dataSource,
    });

    await controller.selectConversation("history");
    controller.showLiveConversation();
    expect(controller.getSnapshot().detailErrorConversationId).toBeUndefined();

    await controller.selectConversation("history");
    controller.resetForNewConversation();
    expect(controller.getSnapshot()).toMatchObject({
      mode: "live",
      detailStatus: "idle",
    });
    expect(controller.getSnapshot().detailError).toBeUndefined();
    expect(controller.getSnapshot().detailErrorConversationId).toBeUndefined();
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
    const controller = createConversationController({
      dataSource,
    });
    const listRequest = controller.refresh();
    const detailRequest = controller.selectConversation("history");
    controller.dispose();
    await Promise.all([listRequest, detailRequest]);
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});
