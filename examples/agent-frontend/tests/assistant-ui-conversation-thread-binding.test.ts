import { createConversationService } from "../services/conversations";
import type { ThreadMessage } from "@assistant-ui/react";
import { describe, expect, it, vi } from "vitest";

import {
  ConversationThreadSelectionDisabledError,
  createConversationServiceThreadBinding,
} from "../agent-ui/conversation/threads/conversation-service-thread-binding";
import type {
  ConversationService,
  ConversationDetail,
  ConversationSnapshot,
} from "../services/conversations";

function threadMessage(id: string, role: "user" | "assistant"): ThreadMessage {
  if (role === "user") {
    return {
      id,
      role,
      content: [{ type: "text", text: id }],
      attachments: [],
      createdAt: new Date(0),
      metadata: { custom: {} },
    };
  }
  return {
    id,
    role,
    content: [{ type: "text", text: id }],
    status: { type: "complete", reason: "unknown" },
    createdAt: new Date(0),
    metadata: {
      unstable_state: null,
      unstable_annotations: [],
      unstable_data: [],
      steps: [],
      custom: {},
    },
  };
}

class FakeConversationService implements ConversationService {
  private readonly listeners = new Set<() => void>();
  private readonly details: ReadonlyMap<string, ConversationDetail>;
  private snapshot: ConversationSnapshot;

  readonly selectConversation = vi.fn(
    async (id: string): Promise<ConversationDetail | undefined> => {
      const detail = this.details.get(id);
      if (detail === undefined) {
        this.snapshot = {
          ...this.snapshot,
          detailStatus: "error",
          detailError: "Conversation API request failed (500)",
          detailErrorConversationId: id,
        };
        this.emit();
        return undefined;
      }
      this.snapshot = {
        ...this.snapshot,
        mode: "history",
        activeConversationId: id,
        activeConversation: detail,
        detailStatus: "ready",
        detailError: undefined,
        detailErrorConversationId: undefined,
      };
      this.emit();
      return detail;
    },
  );

  constructor(
    summaries: ConversationSnapshot["conversations"],
    details: ReadonlyMap<string, ConversationDetail>,
  ) {
    this.details = details;
    this.snapshot = {
      mode: "live",
      conversations: summaries,
      listStatus: "ready",
      detailStatus: "idle",
    };
  }

  getSnapshot(): ConversationSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setConversations(conversations: ConversationSnapshot["conversations"]): void {
    this.snapshot = { ...this.snapshot, conversations };
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }

  async loadConversation(id: string): Promise<ConversationDetail> {
    const detail = await this.selectConversation(id);
    if (detail === undefined) throw new Error("Conversation API request failed (500)");
    return detail;
  }
  showConversation(id: string): void {
    this.snapshot = { ...this.snapshot, mode: "history", activeConversationId: id };
    this.emit();
  }
  async deleteConversation(): Promise<void> { throw new Error("Delete is not configured in this fixture."); }
  async refresh(): Promise<void> {}

  readonly showLiveConversation = vi.fn(() => {
    this.snapshot = {
      ...this.snapshot,
      mode: "live",
      activeConversationId: undefined,
      activeConversation: undefined,
      detailStatus: "idle",
      detailError: undefined,
      detailErrorConversationId: undefined,
    };
    this.emit();
  });

  readonly resetForNewConversation = vi.fn(() => {
    this.snapshot = {
      ...this.snapshot,
      mode: "live",
      activeConversationId: undefined,
      activeConversation: undefined,
      detailStatus: "idle",
      detailError: undefined,
      detailErrorConversationId: undefined,
    };
    this.emit();
  });
}

function createBindingFixture() {
  const live = {
    messages: [threadMessage("live-user", "user"), threadMessage("live-assistant", "assistant")],
  };
  const service = new FakeConversationService(
    [
      { id: "history-1", title: "Alpha", group: "custom", updatedAt: "2026-09-12" },
      { id: "history-2", title: "Beta", disabled: true },
    ],
    new Map([
      ["history-1", {
        id: "history-1",
        title: "Alpha",
        history: {
          format: "langchain",
          messages: [
            { id: "history-user", type: "human", content: "old user" },
            { id: "history-assistant", type: "ai", content: "old assistant" },
          ],
        },
        agentState: { persisted: true },
      }],
      ["history-rich", {
        id: "history-rich",
        title: "Rich history",
        history: {
          format: "langchain",
          messages: [
            {
              id: "rich-assistant",
              type: "ai",
              content: "",
              tool_calls: [{
                id: "rich-tool-1",
                name: "search_files",
                args: { keyword: "history" },
              }],
            },
            {
              id: "rich-tool-result",
              type: "tool",
              tool_call_id: "rich-tool-1",
              name: "search_files",
              status: "success",
              content: '{"files":["history.ts"]}',
            },
          ],
        },
      }],
    ]),
  );
  const binding = createConversationServiceThreadBinding();
  binding.attachConversationService(service);
  return { binding, live, service };
}

function messageIds(messages: readonly { id: string }[]): string[] {
  return messages.map((message) => message.id);
}

describe("ConversationServiceThreadBinding", () => {
  it("keeps initialization ephemeral until a list snapshot confirms persistence", async () => {
    const { binding, service } = createBindingFixture();
    const id = await binding.createNewThread();
    expect(await binding.initializeThread?.(id)).toBe(id);
    expect(await binding.loadThread?.(id)).toEqual({ messages: [] });
    expect(service.selectConversation).not.toHaveBeenCalled();
    expect(service.getSnapshot().mode).toBe("live");
  });

  it("reconciles created ids on list updates before any history read", async () => {
    const details = new Map<string, ConversationDetail>();
    const service = new FakeConversationService([], details);
    const binding = createConversationServiceThreadBinding();
    binding.attachConversationService(service);
    const id = await binding.createNewThread();
    await binding.initializeThread?.(id);
    details.set(id, {
      id, title: "Created history",
      history: { format: "langchain", messages: [
        { id: "created-user", type: "human", content: "request" },
        { id: "created-assistant", type: "ai", content: "complete" },
      ] },
    });
    service.setConversations([{ id, title: "Created history" }]);
    // A subsequent transient list omission must not undo confirmed persistence.
    service.setConversations([]);
    const otherId = await binding.createNewThread();
    expect(otherId).not.toBe(id);
    const loaded = await binding.selectThread(id);
    expect(messageIds(loaded.messages)).toEqual(["created-user", "created-assistant"]);
    expect(service.selectConversation).toHaveBeenCalledWith(id);
    expect(service.getSnapshot()).toMatchObject({ mode: "history", activeConversationId: id });
  });


  it("starts with no persisted list items while retaining a live thread id", () => {
    const binding = createConversationServiceThreadBinding();

    expect(binding.getThreadId()).toMatch(/\S/u);
    expect(binding.getThreadListSnapshot().threads).toEqual([]);
  });

  it("lists only persisted histories while retaining an internal live id", () => {
    const { binding } = createBindingFixture();
    const snapshot = binding.getThreadListSnapshot();

    expect(snapshot.threads.map((item) => item.id)).toEqual([
      "history-1",
      "history-2",
    ]);
    expect(snapshot.threads[0]).toMatchObject({
      title: "Alpha",
      custom: { group: "custom", updatedAt: "2026-09-12" },
    });
    expect(snapshot.threads[1]).toMatchObject({
      title: "Beta",
      custom: { agentUiDisabled: true },
    });
  });

  it("keeps persisted history writable through the runtime binding", async () => {
    const { binding } = createBindingFixture();
    const liveThreadId = binding.getThreadId();
    const changes: boolean[] = [];
    const unsubscribe = binding.subscribe(() => {
      changes.push(binding.getIsDisabled?.() ?? false);
    });

    expect(binding.getIsDisabled?.()).toBe(false);
    await binding.selectThread("history-1");
    expect(binding.getIsDisabled?.()).toBe(false);
    await binding.selectThread(liveThreadId);
    expect(binding.getIsDisabled?.()).toBe(false);
    expect(changes.every(disabled => disabled === false)).toBe(true);
    unsubscribe();
  });

  it("selects rich history through the unified projector", async () => {
    const { binding } = createBindingFixture();

    const history = await binding.selectThread("history-rich");
    const assistant = history.messages[0];

    expect(assistant).toMatchObject({
      id: "rich-assistant",
      role: "assistant",
    });
    expect(assistant?.role === "assistant" ? assistant.content : [])
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "tool-call",
          toolCallId: "rich-tool-1",
          toolName: "search_files",
          args: { keyword: "history" },
          argsText: '{"keyword":"history"}',
          result: '{"files":["history.ts"]}',
        }),
      ]));
  });

  it("does not commit a failed history identity and exposes its error target", async () => {
    const { binding, live, service } = createBindingFixture();
    const liveThreadId = binding.getThreadId();

    await expect(binding.selectThread("history-broken")).rejects.toThrow("500");

    expect(binding.getThreadId()).toBe(liveThreadId);
    expect(service.getSnapshot()).toMatchObject({
      mode: "live",
      detailStatus: "error",
      detailErrorConversationId: "history-broken",
    });
    expect(binding.getThreadListSnapshot().threads.map((item) => item.id)).toContain(
      "history-1",
    );
  });

  it("rejects disabled history without calling the Conversation Service", async () => {
    const { binding, service } = createBindingFixture();

    await expect(binding.selectThread("history-2")).rejects.toBeInstanceOf(
      ConversationThreadSelectionDisabledError,
    );
    expect(service.selectConversation).not.toHaveBeenCalled();
  });

  it("creates a fresh empty thread without leaking the old live transcript", async () => {
    const { binding, live, service } = createBindingFixture();
    const oldId = binding.getThreadId();

    const newId = await binding.createNewThread();
    const loaded = await binding.selectThread(newId);

    expect(service.showLiveConversation).toHaveBeenCalledOnce();
    expect(newId).not.toBe(oldId);
    expect(binding.getThreadId()).toBe(newId);
    expect(loaded.messages).toEqual([]);
    expect(binding.getThreadListSnapshot().threads.map((item) => item.id))
      .toEqual(["history-1", "history-2"]);
    expect(messageIds(live.messages)).toEqual(["live-user", "live-assistant"]);
  });

});


describe("ConversationServiceThreadBinding deletion", () => {
  it("deletes ephemeral identity without persistence or changing the active thread", async () => {
    const remove = vi.fn(async () => undefined);
    const service = createConversationService({ dataSource: {
      list: async () => [], get: async () => { throw new Error("not persisted"); }, delete: remove,
    } });
    const binding = createConversationServiceThreadBinding();
    const detach = binding.attachConversationService(service);
    try {
      const id = binding.getThreadId();
      await binding.deleteThread!(id);
      expect(remove).not.toHaveBeenCalled();
      expect(binding.getThreadId()).toBe(id);
      // Removed identity can no longer be treated as an empty local conversation.
      await expect(binding.loadThread!(id)).rejects.toThrow("not persisted");
    } finally { detach(); service.dispose(); }
  });

  it("deletes a promoted persisted thread through the service without navigating", async () => {
    const remove = vi.fn(async () => undefined);
    const binding = createConversationServiceThreadBinding();
    const id = binding.getThreadId();
    const service = createConversationService({ dataSource: {
      list: async () => [{ id, title: id }], get: async () => { throw new Error("unused"); }, delete: remove,
    } });
    const detach = binding.attachConversationService(service);
    try {
      await service.refresh();
      await binding.deleteThread!(id);
      expect(remove).toHaveBeenCalledExactlyOnceWith(id);
      expect(binding.getThreadId()).toBe(id);
      expect(binding.getThreadListSnapshot().threads).toEqual([]);
    } finally { detach(); service.dispose(); }
  });

  it("preserves persisted metadata when deleting through the service fails", async () => {
    const binding = createConversationServiceThreadBinding();
    const id = binding.getThreadId();
    const service = createConversationService({ dataSource: {
      list: async () => [{ id, title: id }], get: async () => { throw new Error("unused"); },
      delete: async () => { throw new Error("delete failed"); },
    } });
    const detach = binding.attachConversationService(service);
    try {
      await service.refresh();
      await expect(binding.deleteThread!(id)).rejects.toThrow("delete failed");
      expect(binding.getThreadListSnapshot().threads.map(item => item.id)).toEqual([id]);
      expect(binding.getThreadId()).toBe(id);
    } finally { detach(); service.dispose(); }
  });
});
