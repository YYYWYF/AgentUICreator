import { createConversationRemoteThreadListAdapter } from "../src/threads/conversation-remote-thread-list-adapter.js";
import { useAui, type AssistantRuntime, type ThreadMessage } from "@assistant-ui/react";
import {
  act,
  create,
  type ReactTestRenderer,
} from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import {
  ConversationRuntimeProvider,
  type ConversationAgentFactory,
  type ConversationLoadedThread,
  type ConversationThreadBinding,
} from "../src/index.js";

function threadMessage(id: string): ThreadMessage {
  return {
    id,
    role: "user",
    content: [{ type: "text", text: id }],
    attachments: [],
    createdAt: new Date(0),
    metadata: { custom: {} },
  };
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

function createBinding() {
  let threadId = "live";
  const listeners = new Set<() => void>();
  const liveMessages = [threadMessage("live")];
  const historyMessages = [threadMessage("history")];
  const threadListSnapshot = {
    threads: [
      { id: "live", status: "regular" as const },
      { id: "history", status: "regular" as const },
    ],
    archivedThreads: [],
  };
  const selectThread = vi.fn(
    async (nextThreadId: string): Promise<ConversationLoadedThread> => {
      threadId = nextThreadId;
      listeners.forEach((listener) => listener());
      return { messages: historyMessages };
    },
  );
  const binding: ConversationThreadBinding = {
    getThreadId: () => threadId,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    createNewThread: async () => {
      threadId = "new";
      listeners.forEach((listener) => listener());
      return threadId;
    },
    getThreadListSnapshot: () => threadListSnapshot,
    selectThread,
    loadThread: id => id === "live" ? Promise.resolve({ messages: [] }) : selectThread(id),
    activateThread: id => { threadId = id; },
  };
  return { binding, historyMessages, liveMessages, selectThread };
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
}: {
  agent: ReturnType<ConversationAgentFactory>;
  binding: ConversationThreadBinding;
  onRuntime: (runtime: AssistantRuntime) => void;
}) {
  const agentFactory: ConversationAgentFactory = ({ threadId }) => ({ ...agent, threadId }) as never;
  return (
    <ConversationRuntimeProvider
      endpoint="http://example.test/agent"
      threadBinding={binding}
      unstable_agentFactory={agentFactory}
    >
      <RuntimeCapture onRuntime={onRuntime} />
    </ConversationRuntimeProvider>
  );
}

describe("runtime-assistant-ui thread-list binding", () => {
  it("switches the assistant-ui Runtime through the ThreadBinding", async () => {
    const { binding, historyMessages, liveMessages, selectThread } =
      createBinding();
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
        void assistantRuntime.threads.switchToThread("history");
        await new Promise<void>(resolve => setImmediate(resolve));
      });

      expect(selectThread).toHaveBeenCalledOnce();
      expect(selectThread).toHaveBeenCalledWith("history");
      expect(binding.getThreadId()).toBe("history");
      expect(assistantRuntime.threads.getState().mainThreadId).toBe("history");
      expect(assistantRuntime.thread.getState().messages).toEqual(historyMessages);
      expect(agent.threadId).toBe("live");
    } finally {
      if (renderer !== undefined) {
        await act(async () => {
          renderer?.unmount();
        });
      }
    }
  });
});


describe("conversation remote adapter deletion", () => {
  it("delegates exact identity and forgets initialized threads only after success", async () => {
    const { binding } = createBinding();
    const deleteThread = vi.fn(async () => undefined);
    const createNewThread = vi.spyOn(binding, "createNewThread");
    const activateThread = vi.spyOn(binding, "activateThread");
    binding.deleteThread = deleteThread;
    const { adapter, identity } = createConversationRemoteThreadListAdapter(binding);
    const { remoteId } = await adapter.initialize("local");
    expect((await adapter.list()).threads.some(item => item.remoteId === remoteId)).toBe(true);
    await adapter.delete(remoteId);
    expect(deleteThread).toHaveBeenCalledExactlyOnceWith(remoteId);
    expect((await adapter.list()).threads.some(item => item.remoteId === remoteId)).toBe(false);
    expect(identity("local")).not.toBe(remoteId);
    expect(createNewThread).not.toHaveBeenCalled();
    expect(activateThread).not.toHaveBeenCalled();
  });

  it("preserves metadata and local identity on persistence failure", async () => {
    const { binding } = createBinding();
    binding.deleteThread = vi.fn(async () => { throw new Error("delete failed"); });
    const { adapter, identity } = createConversationRemoteThreadListAdapter(binding);
    const { remoteId } = await adapter.initialize("local");
    await expect(adapter.delete(remoteId)).rejects.toThrow("delete failed");
    expect(identity("local")).toBe(remoteId);
    expect((await adapter.list()).threads.some(item => item.remoteId === remoteId)).toBe(true);
  });

  it("rejects deletion when the binding has no persistence capability", async () => {
    const { binding } = createBinding();
    const { adapter } = createConversationRemoteThreadListAdapter(binding);
    await expect(adapter.delete("history")).rejects.toThrow("does not support deleting threads");
  });
});


it("does not resurrect initialized metadata when persistence notifications trigger a reload", async () => {
  const { binding } = createBinding();
  const { adapter } = createConversationRemoteThreadListAdapter(binding);
  const { remoteId } = await adapter.initialize("local");
  let reload: ReturnType<typeof adapter.list> | undefined;
  binding.deleteThread = async () => { reload = adapter.list(); };
  await adapter.delete(remoteId);
  expect(reload).toBeDefined();
  expect((await reload!).threads.some(item => item.remoteId === remoteId)).toBe(false);
});
