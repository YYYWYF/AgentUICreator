import { useAui, type AssistantRuntime, type ThreadMessage } from "@assistant-ui/react";
import {
  act,
  create,
  type ReactTestRenderer,
} from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import {
  AssistantUiAgUiRuntimeProvider,
  type AssistantUiAgentFactory,
  type AssistantUiLoadedThread,
  type AssistantUiThreadBinding,
} from "../src/index.js";

function threadMessage(id: string): ThreadMessage {
  return {
    id,
    role: "user",
    content: [{ type: "text", text: id }],
  } as ThreadMessage;
}

function RuntimeCapture({
  onRuntime,
}: {
  onRuntime: (runtime: AssistantRuntime) => void;
}) {
  onRuntime(useAui());
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
    async (nextThreadId: string): Promise<AssistantUiLoadedThread> => {
      threadId = nextThreadId;
      listeners.forEach((listener) => listener());
      return { messages: historyMessages };
    },
  );
  const binding: AssistantUiThreadBinding = {
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
  };
  return { binding, historyMessages, liveMessages, selectThread };
}

function createAgent(): ReturnType<AssistantUiAgentFactory> {
  return {
    threadId: "live",
    runAgent: vi.fn(),
    abortRun: vi.fn(),
  } as never;
}

function RuntimeFixture({
  agent,
  binding,
  onRuntime,
}: {
  agent: ReturnType<AssistantUiAgentFactory>;
  binding: AssistantUiThreadBinding;
  onRuntime: (runtime: AssistantRuntime) => void;
}) {
  const agentFactory: AssistantUiAgentFactory = () => agent;
  return (
    <AssistantUiAgUiRuntimeProvider
      endpoint="http://example.test/agent"
      threadBinding={binding}
      unstable_agentFactory={agentFactory}
    >
      <RuntimeCapture onRuntime={onRuntime} />
    </AssistantUiAgUiRuntimeProvider>
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
        await assistantRuntime.threads.switchToThread("history");
      });

      expect(selectThread).toHaveBeenCalledOnce();
      expect(selectThread).toHaveBeenCalledWith("history");
      expect(binding.getThreadId()).toBe("history");
      expect(assistantRuntime.threads.getState().mainThreadId).toBe("history");
      expect(assistantRuntime.thread.getState().messages).toEqual(historyMessages);
      expect(agent.threadId).toBe("history");
    } finally {
      if (renderer !== undefined) {
        await act(async () => {
          renderer?.unmount();
        });
      }
    }
  });
});
