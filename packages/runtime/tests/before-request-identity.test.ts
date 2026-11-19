import { describe, expect, it, vi } from "vitest";
import { createConversationRemoteThreadListAdapter } from "../src/threads/conversation-remote-thread-list-adapter.js";
import { createConversationService, createConversationThreadBindingFactory } from "../../plugins/src/plugins/conversation-service/adapters/presentation/service.js";
import { createConversationThreadBindingHost } from "../src/ui/agent-ui/conversation/threads/conversation-service-thread-binding.js";
import type { ConversationThreadListItem } from "../src/threads/types.js";
import type { ConversationDataSource } from "../../plugins/src/plugins/conversation-service/adapters/presentation/data-source.js";

describe("business request identity", () => {
  it("keeps refreshed history and CRUD on the bound business identity without duplicating the local row", async () => {
    let records: ConversationThreadListItem<"regular" | "archived">[] = [];
    const get = vi.fn(async (id: string) => ({ id, title: "Saved", history: { format: "langchain" as const, messages: [] } }));
    const rename = vi.fn<NonNullable<ConversationDataSource["rename"]>>(async () => {});
    const archive = vi.fn<NonNullable<ConversationDataSource["archive"]>>(async () => {});
    const unarchive = vi.fn<NonNullable<ConversationDataSource["unarchive"]>>(async () => {});
    const remove = vi.fn<ConversationDataSource["delete"]>(async () => {});
    const service = createConversationService({ dataSource: {
      list: async () => records.map(record => ({ id: record.id, title: record.title ?? "Saved", status: record.status })),
      get, rename, archive, unarchive, delete: remove,
    } });
    const host = createConversationThreadBindingHost();
    const selected = createConversationThreadBindingFactory(service)({ currentThreadId: host.binding.getThreadId() });
    const stop = host.attach(selected);
    try {
      const routingId = host.binding.getThreadId();
      const persistence = createConversationRemoteThreadListAdapter(host.binding, () => true);
      expect(host.binding.getThreadIsNew?.(routingId)).toBe(true);
      persistence.identity("local", routingId);
      expect(persistence.requestThreadId("local")).toBeUndefined();
      await persistence.adapter.fetch(routingId);
      expect(await host.binding.loadThread!(routingId)).toEqual({ messages: [] });
      // The allocation API may publish its new record before returning the ID.
      records = [{ id: "business", title: "Saved", status: "regular" }];
      await service.refresh();
      persistence.bindThreadId("local", "business");
      expect(get).not.toHaveBeenCalled();
      await service.refresh();
      expect((await persistence.adapter.list()).threads).toEqual([{ remoteId: routingId, title: "Saved", status: "regular", custom: {} }]);
      expect(persistence.localId("business")).toBe("local");
      expect(persistence.identity("mounted-again", routingId)).toBe("business");
      expect(persistence.requestThreadId("mounted-again")).toBe("business");
      await persistence.adapter.rename!(routingId, "Renamed");
      await persistence.adapter.archive!(routingId);
      await persistence.adapter.unarchive!(routingId);
      expect(rename).toHaveBeenCalledWith("business", "Renamed");
      expect(archive.mock.calls[0]?.[0]).toBe("business");
      expect(unarchive.mock.calls[0]?.[0]).toBe("business");
      records = [];
      await persistence.adapter.delete(routingId);
      expect(remove.mock.calls[0]?.[0]).toBe("business");
      expect((await persistence.adapter.list()).threads).toEqual([]);
    } finally { stop(); selected.dispose?.(); service.dispose(); }
  });

  it("rejects collisions with another Thread's bound identity", () => {
    const persistence = createConversationRemoteThreadListAdapter({
      getThreadId: () => "initial", subscribe: () => () => {}, createNewThread: async () => "new",
    }, () => true);
    persistence.identity("one");
    persistence.identity("two");
    persistence.bindThreadId("one", "business");
    expect(() => persistence.bindThreadId("two", "business")).toThrow("AGENT_UI_DUPLICATE_THREAD_ID");
    expect(() => persistence.bindThreadId("two", "one")).toThrow("AGENT_UI_DUPLICATE_THREAD_ID");
    expect(persistence.requestThreadId("two")).toBeUndefined();
  });

  it("retains initial draft provenance with an optional history binding capability", () => {
    const host = createConversationThreadBindingHost();
    const id = host.binding.getThreadId();
    const stop = host.attach({ getThreadId: () => id, subscribe: () => () => {}, createNewThread: async () => "new" });
    try { expect(host.binding.getThreadIsNew?.(id)).toBe(true); }
    finally { stop(); }
    const persisted = createConversationThreadBindingHost("saved");
    expect(persisted.binding.getThreadIsNew?.("saved")).toBe(false);
  });
});
