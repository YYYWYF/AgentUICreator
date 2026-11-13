import { describe, expect, it, vi } from "vitest";
import { createHttpConversationDataSource } from "../src/plugins/conversation-data-source/adapters/presentation/http-data-source";
import { createConversationService } from "../resources/registry/items/foundation/core-application/files/services/conversations/service";
import type { ConversationDataSource } from "../resources/registry/items/foundation/core-application/files/services/conversations/data-source";
import { createConversationServiceThreadBinding } from "../resources/registry/items/foundation/core-adapters/files/agent-ui/conversation/threads/conversation-service-thread-binding";

function dataSource(): ConversationDataSource {
  return {
    list: async () => [{ id: "active", title: "Original" }, { id: "archived", title: "Saved", status: "archived" }],
    get: async id => ({ id, title: "Original", history: { format: "langchain", messages: [] } }),
    delete: vi.fn(async () => {}),
    rename: vi.fn(async () => {}), archive: vi.fn(async () => {}), unarchive: vi.fn(async () => {}),
  };
}

describe("project conversation management", () => {
  it("does not start a refresh after the conversation service is disposed", async () => {
    const source = dataSource(); source.list = vi.fn(source.list);
    const service = createConversationService({ dataSource: source }); service.dispose();
    await service.refresh(); expect(source.list).not.toHaveBeenCalled();
  });

  it("keeps newly refreshed metadata when an older detail selection fails", async () => {
    const source = dataSource(), service = createConversationService({ dataSource: source });
    await service.refresh();
    await service.selectConversation("active");
    let reject!: (error: Error) => void; source.get = () => new Promise((_resolve, fail) => { reject = fail; });
    const selection = service.selectConversation("other");
    source.list = async () => [{ id: "active", title: "Updated by another tab" }, { id: "new", title: "Newly created" }];
    await service.refresh(); reject(new Error("detail unavailable")); await selection;
    expect(service.getSnapshot().conversations).toEqual([{ id: "active", title: "Updated by another tab" }, { id: "new", title: "Newly created" }]);
    expect(service.getSnapshot()).toMatchObject({ listStatus: "ready", detailStatus: "error", detailErrorConversationId: "other" });
    expect(service.getSnapshot().activeConversation?.title).toBe("Updated by another tab");
    service.dispose();
  });

  it("does not restore a deleted previous selection when another detail read fails", async () => {
    const source = dataSource(), service = createConversationService({ dataSource: source });
    await service.refresh(); await service.selectConversation("active");
    let reject!: (error: Error) => void; source.get = () => new Promise((_resolve, fail) => { reject = fail; });
    const selection = service.selectConversation("other"); await service.deleteConversation("active");
    reject(new Error("detail unavailable")); await selection;
    expect(service.getSnapshot().activeConversationId).toBeUndefined(); expect(service.getSnapshot().activeConversation).toBeUndefined();
    expect(service.getSnapshot().conversations.some(item => item.id === "active")).toBe(false); service.dispose();
  });

  it("aborts independent in-flight histories on dispose", async () => {
    const source = dataSource(), reads: { signal: AbortSignal | undefined; resolve: (detail: Awaited<ReturnType<ConversationDataSource["get"]>>) => void }[] = [];
    source.get = (_id, options) => new Promise(resolve => { reads.push({ signal: options?.signal, resolve }); });
    const service = createConversationService({ dataSource: source });
    const pending = [service.loadConversation("active"), service.loadConversation("other")].map(value => value.catch(error => error));
    try {
      service.dispose(); expect(reads).toHaveLength(2);
      expect(reads.every(read => read.signal?.aborted)).toBe(true);
    } finally {
      service.dispose(); for (const read of reads) read.resolve({ id: "late", title: "Late", history: { format: "langchain", messages: [] } });
      await Promise.all(pending);
    }
  });

  it("only cancels the replaced or deleted history while a sibling read remains valid", async () => {
    const source = dataSource(), reads: { id: string; signal: AbortSignal | undefined; resolve: (detail: Awaited<ReturnType<ConversationDataSource["get"]>>) => void }[] = [];
    source.get = (id, options) => new Promise(resolve => { reads.push({ id, signal: options?.signal, resolve }); });
    const service = createConversationService({ dataSource: source });
    const old = service.loadConversation("active").catch(error => error), sibling = service.loadConversation("other");
    const replacement = service.loadConversation("active").catch(error => error);
    try {
      expect(reads[0]!.signal?.aborted).toBe(true); expect(reads[1]!.signal?.aborted).toBe(false);
      await service.deleteConversation("active"); expect(reads[2]!.signal?.aborted).toBe(true);
      expect(reads[1]!.signal?.aborted).toBe(false);
    } finally {
      for (const read of reads) read.resolve({ id: read.id, title: read.id, history: { format: "langchain", messages: [] } });
      await Promise.all([old, sibling, replacement]); service.dispose();
    }
  });

  it("persists exact identities and partitions archived threads through the canonical binding", async () => {
    const source = dataSource();
    const service = createConversationService({ dataSource: source });
    const binding = createConversationServiceThreadBinding(undefined, "active");
    const detach = binding.attachConversationService(service);
    try {
      await service.refresh();
      await binding.selectThread("archived");
      await binding.selectThread("active");
      await binding.renameThread!("active", "Renamed");
      expect(source.rename).toHaveBeenCalledExactlyOnceWith("active", "Renamed");
      expect(service.getSnapshot().activeConversation?.title).toBe("Renamed");
      await binding.archiveThread!("active");
      expect(source.archive).toHaveBeenCalledExactlyOnceWith("active");
      expect(binding.getThreadListSnapshot().threads).toEqual([]);
      expect(binding.getThreadListSnapshot().archivedThreads.map(item => item.id)).toEqual(["active", "archived"]);
      await expect(binding.getThreadMetadata!("active")).resolves.toMatchObject({ status: "archived", title: "Renamed" });
      await binding.unarchiveThread!("active");
      expect(source.unarchive).toHaveBeenCalledExactlyOnceWith("active");
      expect(binding.getThreadListSnapshot().threads).toMatchObject([{ id: "active", title: "Renamed", status: "regular" }]);
      expect(binding.getThreadListSnapshot().archivedThreads.map(item => item.id)).toEqual(["archived"]);
      expect(binding.getThreadId()).toBe("active");
    } finally { detach(); service.dispose(); }
  });

  it.each(["rename", "archive", "unarchive"] as const)("preserves the snapshot when %s fails or is absent", async operation => {
    const source = dataSource();
    source[operation] = vi.fn(async () => { throw new Error("HTTP 403"); });
    const service = createConversationService({ dataSource: source });
    await service.refresh();
    const before = service.getSnapshot();
    const invoke = () => operation === "rename" ? service.renameConversation!("active", "Changed")
      : operation === "archive" ? service.archiveConversation!("active") : service.unarchiveConversation!("archived");
    await expect(invoke()).rejects.toThrow("HTTP 403");
    expect(service.getSnapshot()).toBe(before);
    delete source[operation];
    await expect(invoke()).rejects.toThrow("CONVERSATION_OPERATION_NOT_CONFIGURED");
    expect(service.getSnapshot()).toBe(before);
    service.dispose();
  });

  it("discards a stale list response after a successful rename", async () => {
    const source = dataSource();
    const service = createConversationService({ dataSource: source });
    await service.refresh();
    let resolve!: (items: Awaited<ReturnType<ConversationDataSource["list"]>>) => void;
    source.list = () => new Promise(done => { resolve = done; });
    const reading = service.refresh();
    await service.renameConversation!("active", "Renamed");
    resolve([{ id: "active", title: "Stale" }]);
    await reading;
    expect(service.getSnapshot().conversations[0]?.title).toBe("Renamed");
    service.dispose();
  });
});

describe("project conversation HTTP operations", () => {
  it("uses encoded identities, JSON rename, POST archive/unarchive, and accepts 204", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 204 }));
    const source = createHttpConversationDataSource({ endpoint: "https://business.test/api/", fetch });
    const signal = new AbortController().signal;
    await source.rename!("中文/id", "New title", { signal });
    await source.archive!("中文/id", { signal });
    await source.unarchive!("中文/id", { signal });
    const url = "https://business.test/api/conversations/%E4%B8%AD%E6%96%87%2Fid";
    expect(fetch.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([[url, "PATCH"], [`${url}/archive`, "POST"], [`${url}/unarchive`, "POST"]]);
    expect(fetch.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ title: "New title" }));
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get("content-type")).toBe("application/json");
    expect(fetch.mock.calls.every(([, init]) => init?.signal === signal && init.credentials === "same-origin")).toBe(true);
  });

  it.each([false, true])("preserves archive status in list responses (envelope: %s)", async envelope => {
    const body = envelope ? { returnCode: "SUC0000", body: { conversations: [{ thread_id: "saved", title: "Saved", status: "archived" }] } }
      : { conversations: [{ id: "saved", title: "Saved", status: "archived" }] };
    const source = createHttpConversationDataSource({ endpoint: "/api", fetch: async () => Response.json(body) });
    expect(await source.list()).toEqual([{ id: "saved", title: "Saved", status: "archived" }]);
  });

  it("propagates backend mutation failures", async () => {
    const source = createHttpConversationDataSource({ endpoint: "/api", fetch: async () => new Response(null, { status: 403 }) });
    await expect(source.archive!("id")).rejects.toThrow("403");
  });
});
