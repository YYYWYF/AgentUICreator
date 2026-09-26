import { describe, expect, it, vi } from "vitest";

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

function detail(id: string): ConversationDetail {
  return {
    id,
    title: id,
    history: {
      format: "langchain",
      messages: [{ id, type: "ai", content: id }],
    },
  };
}

describe("ConversationService", () => {
  it("projects initial list loading through ready", async () => {
    const list = deferred<Array<{ id: string; title: string }>>();
    const dataSource: ConversationDataSource = {
      delete: async () => { throw new Error("Delete is not configured in this fixture."); },
      list: () => list.promise,
      get: async () => detail("unused"),
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
      delete: async () => { throw new Error("Delete is not configured in this fixture."); },
      list: async () => [],
      get: async (id) => detail(id),
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
      activeConversation: expect.objectContaining({ id: "conversation-1" }),
    });
    service.showLiveConversation();
    expect(service.getSnapshot()).toMatchObject({
      mode: "live",
      detailStatus: "idle",
      activeConversation: undefined,
    });
    expect(service.getSnapshot().activeConversationId).toBeUndefined();
  });

  it("keeps the authoritative snapshot and records the failed history id", async () => {
    const dataSource: ConversationDataSource = {
      delete: async () => { throw new Error("Delete is not configured in this fixture."); },
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
      delete: async () => { throw new Error("Delete is not configured in this fixture."); },
      list: async () => [],
      get: async (id) => {
        if (shouldFail) throw new Error("temporary failure");
        return detail(id);
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
      activeConversation: expect.objectContaining({ id: "history-retry" }),
    });
    expect(service.getSnapshot().detailError).toBeUndefined();
    expect(service.getSnapshot().detailErrorConversationId).toBeUndefined();
  });

  it("prevents a late detail response from overwriting a newer selection", async () => {
    const requests = new Map<string, ReturnType<typeof deferred<ConversationDetail>>>();
    const dataSource: ConversationDataSource = {
      delete: async () => { throw new Error("Delete is not configured in this fixture."); },
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
    requests.get("B")?.resolve(detail("B"));
    await second;
    requests.get("A")?.resolve(detail("A"));
    await first;
    expect(service.getSnapshot()).toMatchObject({
      activeConversationId: "B",
      activeConversation: expect.objectContaining({ id: "B" }),
    });
  });

  it("resets history state for a Runtime-owned new conversation", async () => {
    const dataSource: ConversationDataSource = {
      delete: async () => { throw new Error("Delete is not configured in this fixture."); },
      list: async () => [],
      get: async (id) => detail(id),
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
      activeConversation: undefined,
      detailStatus: "idle",
      detailError: undefined,
      detailErrorConversationId: undefined,
    });
  });

  it("clears detail errors when returning to live or creating a new conversation", async () => {
    const dataSource: ConversationDataSource = {
      delete: async () => { throw new Error("Delete is not configured in this fixture."); },
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
      delete: async () => { throw new Error("Delete is not configured in this fixture."); },
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


describe("ConversationService deletion", () => {
  it("waits for persistence, removes the normalized id and clears active history and cache", async () => {
    const deletion = deferred<void>();
    const remove = vi.fn(() => deletion.promise);
    const service = createConversationService({ dataSource: {
      list: async () => [{ id: "A", title: "A" }, { id: "B", title: "B" }],
      get: async id => detail(id), delete: remove,
    } });
    await service.refresh();
    await service.loadConversation("A");
    service.showConversation("A");
    const before = service.getSnapshot();
    const request = service.deleteConversation(" A ");
    expect(service.getSnapshot()).toBe(before);
    deletion.resolve();
    await request;
    expect(remove).toHaveBeenCalledExactlyOnceWith("A");
    expect(service.getSnapshot()).toMatchObject({
      conversations: [{ id: "B", title: "B" }], mode: "live",
      activeConversationId: undefined, activeConversation: undefined,
      detailStatus: "idle", detailError: undefined, detailErrorConversationId: undefined,
    });
    service.showConversation("A");
    expect(service.getSnapshot().activeConversation).toBeUndefined();
    expect(service.getSnapshot().detailStatus).toBe("idle");
  });

  it("keeps the complete snapshot when persistence fails", async () => {
    const service = createConversationService({ dataSource: {
      list: async () => [{ id: "A", title: "A" }], get: async id => detail(id),
      delete: async () => { throw new Error("delete failed"); },
    } });
    await service.refresh();
    await service.selectConversation("A");
    const before = service.getSnapshot();
    await expect(service.deleteConversation("A")).rejects.toThrow("delete failed");
    expect(service.getSnapshot()).toBe(before);
  });

  it("invalidates in-flight list and selected detail after success", async () => {
    const list = deferred<Array<{ id: string; title: string }>>();
    const read = deferred<ConversationDetail>();
    const signals: AbortSignal[] = [];
    const service = createConversationService({ dataSource: {
      list: options => { signals.push(options!.signal!); return list.promise; },
      get: (_id, options) => { signals.push(options!.signal!); return read.promise; },
      delete: async () => undefined,
    } });
    const listing = service.refresh();
    const selection = service.selectConversation("A");
    await service.deleteConversation("A");
    expect(signals.every(signal => signal.aborted)).toBe(true);
    list.resolve([{ id: "A", title: "A" }]);
    read.resolve(detail("A"));
    await Promise.all([listing, selection]);
    expect(service.getSnapshot()).toMatchObject({ conversations: [], mode: "live", detailStatus: "idle" });
  });

  it("does not repopulate history cache from an independent read completed after deletion", async () => {
    const read = deferred<ConversationDetail>();
    const service = createConversationService({ dataSource: {
      list: async () => [], get: () => read.promise, delete: async () => undefined,
    } });
    const loading = service.loadConversation("A");
    const rejected = expect(loading).rejects.toMatchObject({ name: "AbortError" });
    await service.deleteConversation("A");
    read.resolve(detail("A"));
    await rejected;
    service.showConversation("A");
    expect(service.getSnapshot().activeConversation).toBeUndefined();
    expect(service.getSnapshot().detailStatus).toBe("idle");
  });

  it("preserves another thread's business selection and ongoing detail request", async () => {
    const read = deferred<ConversationDetail>();
    let signal: AbortSignal | undefined;
    const service = createConversationService({ dataSource: {
      list: async () => [{ id: "A", title: "A" }, { id: "B", title: "B" }],
      get: (_id, options) => { signal = options?.signal; return read.promise; },
      delete: async () => undefined,
    } });
    await service.refresh();
    const selection = service.selectConversation("A");
    await service.deleteConversation("B");
    expect(signal?.aborted).toBe(false);
    read.resolve(detail("A"));
    await selection;
    expect(service.getSnapshot().activeConversation?.id).toBe("A");
  });
});
