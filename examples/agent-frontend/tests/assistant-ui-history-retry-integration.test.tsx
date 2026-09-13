import { useAui, type AssistantRuntime, type ThreadMessage } from "@assistant-ui/react";
import {
  act,
  create,
  type ReactTestRenderer,
} from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import type { AgentMessage } from "../framework/contracts/ui-plugin";
import {
  AssistantUiAgUiRuntimeProvider,
  useAssistantUiRuntimeBridge,
  type AssistantUiAgentRuntimeBridge,
  type AssistantUiAgentFactory,
} from "@agent-ui/runtime-assistant-ui";
import {
  createConversationServiceAssistantUiThreadBinding,
  type ConversationServiceAssistantUiThreadBinding,
} from "../agent-ui/adapters/assistant-ui/threads/conversation-service-thread-binding";
import {
  createConversationController,
  type AgentUIConversationService,
  type ConversationDetail,
  type ConversationDataSource,
  type ConversationSnapshot,
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

class RetryConversationService implements AgentUIConversationService {
  private readonly listeners = new Set<() => void>();
  private selectionAttempts = 0;
  private snapshot: ConversationSnapshot = {
    mode: "live",
    conversations: [{ id: "history-retry", title: "History Retry" }],
    historyMessages: [],
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
        messages: [
          agentMessage("history-user", "user", "old user"),
          agentMessage("history-assistant", "assistant", "old assistant"),
        ],
      };
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

  getSnapshot(): ConversationSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
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
  onRuntime: (runtime: AssistantUiAgentRuntimeBridge) => void;
}) {
  const { agentRuntime } = useAssistantUiRuntimeBridge();
  onRuntime(agentRuntime);
  return null;
}

function createAgent(): ReturnType<AssistantUiAgentFactory> {
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
  agent: ReturnType<AssistantUiAgentFactory>;
  binding: ConversationServiceAssistantUiThreadBinding;
  onRuntime: (runtime: AssistantRuntime) => void;
  onBridge?: (runtime: AssistantUiAgentRuntimeBridge) => void;
}) {
  const agentFactory: AssistantUiAgentFactory = () => agent;
  return (
    <AssistantUiAgUiRuntimeProvider
      endpoint="http://example.test/agent"
      threadBinding={binding}
      unstable_agentFactory={agentFactory}
    >
      <RuntimeCapture onRuntime={onRuntime} />
      {onBridge === undefined ? null : <BridgeCapture onRuntime={onBridge} />}
    </AssistantUiAgUiRuntimeProvider>
  );
}

describe("assistant-ui history retry navigation", () => {
  it("routes ThreadList and Plugin Action New Thread through one Runtime owner", async () => {
    const dataSource: ConversationDataSource = {
      list: async () => [],
      get: async (id) => ({ id, title: id, messages: [] }),
    };
    const service = createConversationController({ dataSource });
    const binding = createConversationServiceAssistantUiThreadBinding();
    const detach = binding.attachConversationService(service);
    const liveMessages = [
      threadMessage("live-user", "user"),
      threadMessage("live-assistant", "assistant"),
    ];
    binding.captureLiveThread({ messages: liveMessages });
    const firstThreadId = binding.getThreadId();
    const agent = createAgent();
    let runtime: AssistantRuntime | undefined;
    let bridge: AssistantUiAgentRuntimeBridge | undefined;
    let renderer: ReactTestRenderer | undefined;

    try {
      await act(async () => {
        renderer = create(
          <RuntimeFixture
            agent={agent}
            binding={binding}
            onRuntime={(nextRuntime) => {
              runtime = nextRuntime;
            }}
            onBridge={(nextRuntime) => {
              bridge = nextRuntime;
            }}
          />,
        );
        await Promise.resolve();
      });
      if (runtime === undefined || bridge === undefined) {
        throw new Error("assistant-ui Runtime bridge was not captured");
      }
      const assistantRuntime = runtime;
      const agentRuntime = bridge;

      await act(async () => {
        assistantRuntime.thread.reset(liveMessages);
        await Promise.resolve();
        await assistantRuntime.threads.switchToNewThread();
      });

      const threadListThreadId = binding.getThreadId();
      expect(threadListThreadId).not.toBe(firstThreadId);
      expect(assistantRuntime.threads.getState().mainThreadId).toBe(
        threadListThreadId,
      );
      expect(assistantRuntime.thread.getState().threadId).toBe(
        threadListThreadId,
      );
      expect(agent.threadId).toBe(threadListThreadId);
      expect(assistantRuntime.thread.getState().messages).toEqual([]);
      expect(service.getSnapshot()).toMatchObject({
        mode: "live",
        activeConversationId: undefined,
        historyMessages: [],
        detailStatus: "idle",
        detailError: undefined,
        detailErrorConversationId: undefined,
      });

      await act(async () => {
        await agentRuntime.startNewConversation();
      });

      const pluginActionThreadId = binding.getThreadId();
      expect(pluginActionThreadId).not.toBe(threadListThreadId);
      expect(assistantRuntime.threads.getState().mainThreadId).toBe(
        pluginActionThreadId,
      );
      expect(assistantRuntime.thread.getState().threadId).toBe(
        pluginActionThreadId,
      );
      expect(agent.threadId).toBe(pluginActionThreadId);
      expect(agentRuntime.getSnapshot().conversation.id).toBe(
        pluginActionThreadId,
      );
    } finally {
      detach();
      service.dispose();
      if (renderer !== undefined) {
        await act(async () => {
          renderer?.unmount();
        });
      }
    }
  });

  it("keeps the live thread on failure and hydrates history through retry", async () => {
    const service = new RetryConversationService();
    const binding = createConversationServiceAssistantUiThreadBinding();
    const detach = binding.attachConversationService(service);
    const liveMessages = [
      threadMessage("live-user", "user"),
      threadMessage("live-assistant", "assistant"),
    ];
    binding.captureLiveThread({ messages: liveMessages });
    const liveThreadId = binding.getThreadId();
    const agent = createAgent();
    let runtime: AssistantRuntime | undefined;
    let renderer: ReactTestRenderer | undefined;

    try {
      await act(async () => {
        renderer = create(
          <RuntimeFixture
            agent={agent}
            binding={binding}
            onRuntime={(nextRuntime) => {
              runtime = nextRuntime;
            }}
          />,
        );
        await Promise.resolve();
      });
      if (runtime === undefined) throw new Error("Runtime was not captured");
      const assistantRuntime = runtime;

      await act(async () => {
        assistantRuntime.thread.reset(liveMessages);
        await Promise.resolve();
      });

      await act(async () => {
        await assistantRuntime.threads.switchToThread("history-retry");
      });
      expect(binding.getThreadId()).toBe(liveThreadId);
      expect(assistantRuntime.thread.getState().threadId).toBe(liveThreadId);
      expect(messageIds(assistantRuntime.thread.getState().messages)).toEqual([
        "live-user",
        "live-assistant",
      ]);
      expect(service.getSnapshot()).toMatchObject({
        mode: "live",
        detailStatus: "error",
        detailErrorConversationId: "history-retry",
      });

      await act(async () => {
        await assistantRuntime.threads.switchToThread("history-retry");
      });
      expect(service.getSnapshot()).toMatchObject({
        mode: "history",
        activeConversationId: "history-retry",
        detailStatus: "ready",
        detailError: undefined,
        detailErrorConversationId: undefined,
      });
      expect(binding.getThreadId()).toBe("history-retry");
      expect(assistantRuntime.threads.getState().mainThreadId).toBe("history-retry");
      expect(messageIds(assistantRuntime.thread.getState().messages)).toEqual([
        "history-user",
        "history-assistant",
      ]);
      expect(agent.threadId).toBe("history-retry");
      expect(service.selectConversation).toHaveBeenCalledTimes(2);

      await act(async () => {
        await assistantRuntime.threads.switchToThread(liveThreadId);
      });
      expect(service.getSnapshot().mode).toBe("live");
      expect(binding.getThreadId()).toBe(liveThreadId);
      expect(messageIds(assistantRuntime.thread.getState().messages)).toEqual([
        "live-user",
        "live-assistant",
      ]);
    } finally {
      detach();
      if (renderer !== undefined) {
        await act(async () => {
          renderer?.unmount();
        });
      }
    }
  });

  it("keeps Runtime and Service aligned after New Thread succeeds", async () => {
    const service = new RetryConversationService();
    const binding = createConversationServiceAssistantUiThreadBinding();
    const detach = binding.attachConversationService(service);
    const liveMessages = [
      threadMessage("live-user", "user"),
      threadMessage("live-assistant", "assistant"),
    ];
    binding.captureLiveThread({ messages: liveMessages });
    const oldThreadId = binding.getThreadId();
    const agent = createAgent();
    let runtime: AssistantRuntime | undefined;
    let renderer: ReactTestRenderer | undefined;

    try {
      await act(async () => {
        renderer = create(
          <RuntimeFixture
            agent={agent}
            binding={binding}
            onRuntime={(nextRuntime) => {
              runtime = nextRuntime;
            }}
          />,
        );
        await Promise.resolve();
      });
      if (runtime === undefined) throw new Error("Runtime was not captured");
      const assistantRuntime = runtime;

      await act(async () => {
        assistantRuntime.thread.reset(liveMessages);
        await Promise.resolve();
        await assistantRuntime.threads.switchToNewThread();
      });

      const newThreadId = binding.getThreadId();
      expect(service.resetForNewConversation).toHaveBeenCalledOnce();
      expect(newThreadId).not.toBe(oldThreadId);
      expect(assistantRuntime.threads.getState().mainThreadId).toBe(newThreadId);
      expect(assistantRuntime.thread.getState().threadId).toBe(newThreadId);
      expect(assistantRuntime.thread.getState().messages).toEqual([]);
      expect(agent.threadId).toBe(newThreadId);
    } finally {
      detach();
      if (renderer !== undefined) {
        await act(async () => {
          renderer?.unmount();
        });
      }
    }
  });
});
