import type { ThreadMessage } from "@assistant-ui/react";
import { describe, expect, it, vi } from "vitest";

import type { AgentMessage } from "../framework/contracts/ui-plugin";
import {
  ConversationThreadSelectionDisabledError,
  createConversationServiceAssistantUiThreadBinding,
} from "../agent-ui/adapters/assistant-ui/threads/conversation-service-thread-binding";
import type {
  AgentUIConversationService,
  ConversationDetail,
  ConversationSnapshot,
} from "../services/conversations";

function agentMessage(
  id: string,
  role: "user" | "assistant",
  content: string,
): AgentMessage {
  return {
    id,
    producer: { type: "root" },
    role,
    content,
  };
}

function threadMessage(id: string, role: "user" | "assistant"): ThreadMessage {
  return {
    id,
    role,
    content: [{ type: "text", text: id }],
  } as ThreadMessage;
}

class FakeConversationService implements AgentUIConversationService {
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
        historyMessages: detail.messages,
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
      historyMessages: [],
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

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }

  async refresh(): Promise<void> {}

  readonly showLiveConversation = vi.fn(() => {
    this.snapshot = {
      ...this.snapshot,
      mode: "live",
      activeConversationId: undefined,
      historyMessages: [],
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
      historyMessages: [],
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
        messages: [
          agentMessage("history-user", "user", "old user"),
          agentMessage("history-assistant", "assistant", "old assistant"),
        ],
      }],
    ]),
  );
  const binding = createConversationServiceAssistantUiThreadBinding();
  binding.attachConversationService(service);
  binding.captureLiveThread(live);
  return { binding, live, service };
}

function messageIds(messages: readonly ThreadMessage[]): string[] {
  return messages.map((message) => message.id);
}

describe("ConversationServiceAssistantUiThreadBinding", () => {
  it("projects the live thread and conversation catalog metadata", () => {
    const { binding } = createBindingFixture();
    const snapshot = binding.getThreadListSnapshot();

    expect(snapshot.threads.map((item) => item.id)).toEqual([
      binding.getThreadId(),
      "history-1",
      "history-2",
    ]);
    expect(snapshot.threads[1]).toMatchObject({
      title: "Alpha",
      custom: { group: "custom", updatedAt: "2026-09-12" },
    });
    expect(snapshot.threads[2]).toMatchObject({
      title: "Beta",
      custom: { agentUiDisabled: true },
    });
  });

  it("preserves live transcript across assistant-ui intermediate empty snapshots", async () => {
    const { binding, live } = createBindingFixture();
    const liveThreadId = binding.getThreadId();

    binding.captureLiveThread({ messages: [] });
    await binding.selectThread("history-1");
    binding.captureLiveThread({ messages: [] });
    const restored = await binding.selectThread(liveThreadId);

    expect(messageIds(restored.messages)).toEqual(messageIds(live.messages));
  });

  it("switches live to history and history back to the original live transcript", async () => {
    const { binding, live, service } = createBindingFixture();
    const liveThreadId = binding.getThreadId();

    const history = await binding.selectThread("history-1");
    expect(binding.getThreadId()).toBe("history-1");
    expect(service.getSnapshot()).toMatchObject({
      mode: "history",
      activeConversationId: "history-1",
    });
    expect(messageIds(history.messages)).toEqual([
      "history-user",
      "history-assistant",
    ]);

    const restored = await binding.selectThread(liveThreadId);
    expect(binding.getThreadId()).toBe(liveThreadId);
    expect(messageIds(restored.messages)).toEqual(messageIds(live.messages));
  });

  it("does not commit a failed history identity and exposes its error target", async () => {
    const { binding, live, service } = createBindingFixture();
    const liveThreadId = binding.getThreadId();

    const loaded = await binding.selectThread("history-broken");

    expect(binding.getThreadId()).toBe(liveThreadId);
    expect(messageIds(loaded.messages)).toEqual(messageIds(live.messages));
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

    expect(service.resetForNewConversation).toHaveBeenCalledOnce();
    expect(service.showLiveConversation).not.toHaveBeenCalled();
    expect(newId).not.toBe(oldId);
    expect(binding.getThreadId()).toBe(newId);
    expect(loaded.messages).toEqual([]);
    expect(messageIds(live.messages)).toEqual(["live-user", "live-assistant"]);
  });

});
