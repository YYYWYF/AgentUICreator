import { useAui, type AssistantRuntime, type ThreadMessage } from "@assistant-ui/react";
import {
  act,
  create,
  type ReactTestRenderer,
} from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import {
  ConversationRuntimeProvider,
  useConversationRuntimeBridge,
  type ConversationAgentRuntimeBridge,
  type ConversationAgentFactory,
} from "@agent-ui/runtime-conversation";
import {
  createConversationServiceThreadBinding,
  type ConversationServiceThreadBinding,
} from "../agent-ui/conversation/threads/conversation-service-thread-binding";
import {
  createConversationService,
  type ConversationService,
  type ConversationDetail,
  type ConversationDataSource,
  type ConversationSnapshot,
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

function messageIds(messages: readonly ThreadMessage[]): string[] {
  return messages.map((message) => message.id);
}

class RetryConversationService implements ConversationService {
  private readonly listeners = new Set<() => void>();
  private selectionAttempts = 0;
  private snapshot: ConversationSnapshot = {
    mode: "live",
    conversations: [{ id: "history-retry", title: "History Retry" }],
    listStatus: "ready",
    detailStatus: "idle",
  };

  readonly selectConversation = vi.fn(
    async (id: string): Promise<ConversationDetail | undefined> => {
      this.selectionAttempts += 1;
      if (this.selectionAttempts === 1) {
        this.snapshot = {
          ...this.snapshot,
          detailStatus: "error",
          detailError: "Conversation API request failed (500)",
          detailErrorConversationId: id,
        };
        this.emit();
        return undefined;
      }

      const detail: ConversationDetail = {
        id,
        title: "History Retry",
        history: {
          format: "langchain",
          messages: [
            { id: "history-user", type: "human", content: "old user" },
            { id: "history-assistant", type: "ai", content: "old assistant" },
          ],
        },
      };
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

  getSnapshot(): ConversationSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
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

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }
}

function RuntimeCapture({
  onRuntime,
}: {
  onRuntime: (runtime: AssistantRuntime) => void;
}) {
  const aui = useAui();
  const runtime = aui.threads.__internal_getAssistantRuntime?.();
  if (runtime === undefined) {
    throw new Error(
      "AssistantRuntime is unavailable from the assistant-ui client.",
    );
  }
  onRuntime(runtime);
  return null;
}

function BridgeCapture({
  onRuntime,
}: {
  onRuntime: (runtime: ConversationAgentRuntimeBridge) => void;
}) {
  const { agentRuntime } = useConversationRuntimeBridge();
  onRuntime(agentRuntime);
  return null;
}

function createAgent(): ReturnType<ConversationAgentFactory> {
  return {
    threadId: "live",
    runAgent: vi.fn(),
    abortRun: vi.fn(),
    subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
  } as never;
}

function RuntimeFixture({
  agent,
  binding,
  onRuntime,
  onBridge,
}: {
  agent: ReturnType<ConversationAgentFactory>;
  binding: ConversationServiceThreadBinding;
  onRuntime: (runtime: AssistantRuntime) => void;
  onBridge?: (runtime: ConversationAgentRuntimeBridge) => void;
}) {
  const agentFactory: ConversationAgentFactory = () => agent;
  return (
    <ConversationRuntimeProvider
      endpoint="http://example.test/agent"
      threadBinding={binding}
      unstable_agentFactory={agentFactory}
    >
      <RuntimeCapture onRuntime={onRuntime} />
      {onBridge === undefined ? null : <BridgeCapture onRuntime={onBridge} />}
    </ConversationRuntimeProvider>
  );
}

async function flush() { await new Promise<void>(resolve => setImmediate(resolve)); }
async function mount(service: ConversationService) {
  const binding = createConversationServiceThreadBinding();
  const detach = binding.attachConversationService(service);
  const agent = createAgent();
  let runtime!: AssistantRuntime;
  let bridge!: ConversationAgentRuntimeBridge;
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<RuntimeFixture agent={agent} binding={binding}
      onRuntime={next => { runtime = next; }} onBridge={next => { bridge = next; }} />);
    await flush();
  });
  return { binding, agent, runtime, get bridge() { return bridge; },
    async dispose() { await act(async () => { renderer.unmount(); await flush(); }); detach(); },
  };
}

describe("assistant-ui history and new-thread integration", () => {
  it("uses both ThreadList and Plugin new-thread actions without changing old Agent ownership", async () => {
    const service = createConversationService({ dataSource: { list: async () => [], get: async id => ({ id, title: id, history: { format: "langchain", messages: [] } }) } });
    const f = await mount(service);
    try {
      const first = f.binding.getThreadId();
      await act(async () => { void f.runtime.threads.switchToNewThread(); await flush(); });
      const second = f.binding.getThreadId();
      expect(second).not.toBe(first);
      expect(f.runtime.thread.getState().messages).toEqual([]);
      expect(f.bridge.getSnapshot().conversation.id).toBe(second);
      expect(f.runtime.threads.mainItem.getState().remoteId).toBeUndefined();
      await act(async () => { void f.bridge.startNewConversation(); await flush(); });
      expect(f.binding.getThreadId()).not.toBe(second);
      expect(f.bridge.getSnapshot().conversation.id).toBe(f.binding.getThreadId());
      expect(f.agent.threadId).toBe("live");
      expect(service.getSnapshot().mode).toBe("live");
    } finally { await f.dispose(); service.dispose(); }
  });
  it("retains live history while a failed history runtime is retried", async () => {
    const service = new RetryConversationService();
    const f = await mount(service);
    try {
      const initial = f.binding.getThreadId();
      const liveMessages = [threadMessage("live-user", "user"), threadMessage("live-assistant", "assistant")];
      await act(async () => { f.runtime.thread.reset(liveMessages); await flush(); });
      await act(async () => { void f.runtime.threads.switchToThread("history-retry"); await flush(); });
      expect(f.runtime.thread.getState().isDisabled).toBe(true);
      expect(f.bridge.getSnapshot().run.status).toBe("error");
      expect(messageIds(f.runtime.threads.getById(initial).getState().messages)).toEqual(["live-user", "live-assistant"]);
      await act(async () => { void f.runtime.threads.reloadMainThread(); await flush(); });
      expect(f.runtime.thread.getState().isDisabled).toBe(false);
      expect(messageIds(f.runtime.thread.getState().messages)).toEqual(["history-user", "history-assistant"]);
      expect(service.selectConversation).toHaveBeenCalledTimes(2);
      expect(f.agent.runAgent).not.toHaveBeenCalled();
      await act(async () => { void f.runtime.threads.switchToThread(initial); await flush(); });
      expect(messageIds(f.runtime.thread.getState().messages)).toEqual(["live-user", "live-assistant"]);
      expect(service.selectConversation).toHaveBeenCalledTimes(2);
    } finally { await f.dispose(); }
  });
  it("keeps business selection aligned with a writable empty new thread", async () => {
    const f = await mount(new RetryConversationService());
    try {
      const previous = f.binding.getThreadId();
      await act(async () => { void f.runtime.threads.switchToNewThread(); await flush(); });
      expect(f.binding.getThreadId()).not.toBe(previous);
      expect(f.bridge.getSnapshot().conversation.id).toBe(f.binding.getThreadId());
      expect(f.runtime.thread.getState().messages).toEqual([]);
      expect(f.runtime.thread.getState().isDisabled).toBe(false);
    } finally { await f.dispose(); }
  });
});
