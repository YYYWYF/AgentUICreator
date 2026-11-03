import { createConversationRemoteThreadListAdapter } from "../src/threads/conversation-remote-thread-list-adapter.js";
import { HttpAgent } from "@ag-ui/client";
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

function threadMessage(id: string): Extract<ThreadMessage, { role: "user" }> {
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
  return Object.assign(new HttpAgent({ url: "http://example.test/agent", threadId: "live" }), {
    runAgent: vi.fn(),
    abortRun: vi.fn(),
  });
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
  const agentFactory: ConversationAgentFactory = ({ endpoint, threadId }) =>
    Object.assign(new HttpAgent({ url: endpoint, threadId }), { runAgent: agent.runAgent, abortRun: agent.abortRun });
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
  it("removes a previously persisted cached row after another client deletes it, while retaining an unsaved local thread", async () => {
    const { binding } = createBinding();
    let items = [{ id: "live", status: "regular" as const, title: "Current" }, { id: "history", status: "regular" as const, title: "Deleted elsewhere" }];
    binding.getThreadListSnapshot = () => ({ threads: items, archivedThreads: [] });
    const { adapter } = createConversationRemoteThreadListAdapter(binding);
    await adapter.list(); await adapter.fetch("history");
    const persisted = await adapter.initialize("persisted-local");
    items = [...items, { id: persisted.remoteId, status: "regular", title: "Persisted from a local run" }];
    await adapter.list();
    const local = await adapter.initialize("unsaved-local");
    items = items.filter(item => item.id !== "history" && item.id !== persisted.remoteId);
    const latest = await adapter.list();
    expect(latest.threads.map(item => item.remoteId)).toEqual(["live", local.remoteId]);
    items = [...items, { id: "history", status: "regular", title: "Restored by backend" }];
    expect((await adapter.list()).threads.find(item => item.remoteId === "history")?.title).toBe("Restored by backend");
    items = [];
    await adapter.list();
    await expect(adapter.fetch("live")).rejects.toThrow('Conversation "live" was not found.');
    await adapter.generateTitle("history", [threadMessage("late title")]);
    expect((await adapter.list()).threads.map(item => item.remoteId)).toEqual([local.remoteId]);
  });

  it.each([false, true])("automatically titles a conversation from its first user message (new thread: %s)", async (startNewThread) => {
    const { binding } = createBinding();
    const renameThread = vi.fn(async () => {});
    binding.renameThread = renameThread;
    let runtime!: AssistantRuntime;
    let renderer: ReactTestRenderer | undefined;
    const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const input = JSON.parse(String(init?.body));
      const messageId = `${input.runId}-answer`;
      const events = [
        { type: "RUN_STARTED", threadId: input.threadId, runId: input.runId },
        { type: "TEXT_MESSAGE_START", messageId, role: "assistant" },
        { type: "TEXT_MESSAGE_CONTENT", messageId, delta: "Done" },
        { type: "TEXT_MESSAGE_END", messageId },
        { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId },
      ];
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), {
        headers: { "Content-Type": "text/event-stream" },
      });
    });
    try {
      await act(async () => {
        renderer = create(<ConversationRuntimeProvider endpoint="http://example.test/agent" threadBinding={binding}
          unstable_agentFactory={({ threadId }) => new HttpAgent({ url: "http://example.test/agent", threadId, fetch })}>
          <RuntimeCapture onRuntime={next => { runtime = next; }} />
        </ConversationRuntimeProvider>);
        await new Promise<void>(resolve => setImmediate(resolve));
      });
      await act(async () => {
        if (startNewThread) await runtime.threads.switchToNewThread();
      });
      await act(async () => {
        runtime.thread.append({ role: "user", content: [{ type: "text", text: "First request" }], startRun: true });
        await new Promise<void>(resolve => setImmediate(resolve));
      });
      await act(async () => {
        expect(fetch).toHaveBeenCalledTimes(1);
        await vi.waitFor(() => expect(runtime.threads.mainItem.getState().title).toBe("First request"));
      });
      await act(async () => {
        runtime.thread.append({ role: "user", content: [{ type: "text", text: "Follow-up request" }], startRun: true });
        await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
      });
      expect(runtime.threads.mainItem.getState().title).toBe("First request");
      // Opening explicit management APIs must not turn local default titles into writes.
      expect(renameThread).not.toHaveBeenCalled();
    } finally {
      if (renderer) await act(async () => { renderer?.unmount(); });
    }
  });

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

describe("conversation default titles", () => {
  async function readTitle(stream: Awaited<ReturnType<ReturnType<typeof createConversationRemoteThreadListAdapter>["adapter"]["generateTitle"]>>) {
    const reader = stream.getReader();
    let title = "";
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) return title;
        if (result.value.type === "text-delta") title += result.value.textDelta;
      }
    } finally { reader.releaseLock(); }
  }

  it("uses the first user's text, retains all text parts, and does not retitle on follow-ups", async () => {
    const { binding } = createBinding();
    const { adapter } = createConversationRemoteThreadListAdapter(binding);
    const { remoteId } = await adapter.initialize("local");
    const first = { ...threadMessage("first"), content: [
      { type: "text" as const, text: "  First line" },
      { type: "text" as const, text: "Second line  " },
    ] };
    expect(await readTitle(await adapter.generateTitle(remoteId, [first, threadMessage("later")]))).toBe("First line\nSecond line");
    expect(await readTitle(await adapter.generateTitle(remoteId, [threadMessage("edited")]))).toBe("First line\nSecond line");
    expect(await adapter.fetch(remoteId)).toMatchObject({ title: "First line\nSecond line" });
    expect((await adapter.list()).threads.find(item => item.remoteId === remoteId)?.title).toBe("First line\nSecond line");
  });

  it("keeps the local default through an untitled reload and respects a backend title", async () => {
    const { binding } = createBinding();
    const { adapter } = createConversationRemoteThreadListAdapter(binding);
    await readTitle(await adapter.generateTitle("live", [threadMessage("first")]));
    expect(await adapter.fetch("live")).toMatchObject({ title: "first" });
    expect((await adapter.list()).threads.find(item => item.remoteId === "live")?.title).toBe("first");
    binding.getThreadListSnapshot = () => ({ threads: [{ id: "live", status: "regular", title: "Backend title" }], archivedThreads: [] });
    expect(await readTitle(await adapter.generateTitle("live", [threadMessage("first")]))).toBe("Backend title");
    expect(await adapter.fetch("live")).toMatchObject({ title: "Backend title" });
  });

  it("leaves a textless first user message untitled instead of using a later message", async () => {
    const { binding } = createBinding();
    const { adapter } = createConversationRemoteThreadListAdapter(binding);
    expect(await readTitle(await adapter.generateTitle("live", [
      { ...threadMessage("attachment-only"), content: [] }, threadMessage("later"),
    ]))).toBe("");
    expect(await readTitle(await adapter.generateTitle("history", []))).toBe("");
  });

  it("does not restore a deleted thread when title generation runs late", async () => {
    const { binding } = createBinding();
    binding.deleteThread = async () => {};
    const { adapter } = createConversationRemoteThreadListAdapter(binding);
    const { remoteId } = await adapter.initialize("local");
    await adapter.delete(remoteId);
    expect(await readTitle(await adapter.generateTitle(remoteId, [threadMessage("late")]))).toBe("");
    expect((await adapter.list()).threads.some(item => item.remoteId === remoteId)).toBe(false);
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

describe("conversation remote adapter management", () => {
  it("delegates rename/archive/unarchive and retains metadata across reloads", async () => {
    const { binding } = createBinding();
    binding.getThreadListSnapshot = () => ({ threads: [], archivedThreads: [] });
    binding.renameThread = vi.fn(async () => {});
    binding.archiveThread = vi.fn(async () => {});
    binding.unarchiveThread = vi.fn(async () => {});
    const { adapter } = createConversationRemoteThreadListAdapter(binding);
    const { remoteId } = await adapter.initialize("local");
    await adapter.rename(remoteId, "Renamed");
    await adapter.archive(remoteId);
    expect(binding.renameThread).toHaveBeenCalledExactlyOnceWith(remoteId, "Renamed");
    expect(binding.archiveThread).toHaveBeenCalledExactlyOnceWith(remoteId);
    expect((await adapter.list()).threads).toEqual([{ remoteId, title: "Renamed", status: "archived" }]);
    await adapter.unarchive!(remoteId);
    expect(binding.unarchiveThread).toHaveBeenCalledExactlyOnceWith(remoteId);
    expect(await adapter.fetch(remoteId)).toMatchObject({ title: "Renamed", status: "regular" });
  });

  it.each(["rename", "archive", "unarchive"] as const)("does not accept %s without successful persistence", async operation => {
    const { binding } = createBinding();
    binding.getThreadListSnapshot = () => ({ threads: [], archivedThreads: [] });
    const { adapter } = createConversationRemoteThreadListAdapter(binding);
    const { remoteId } = await adapter.initialize("local");
    const invoke = () => operation === "rename" ? adapter.rename(remoteId, "Changed") : adapter[operation]!(remoteId);
    await expect(invoke()).rejects.toThrow("does not support");
    const reject = async () => { throw new Error("permission denied"); };
    binding.renameThread = reject; binding.archiveThread = reject; binding.unarchiveThread = reject;
    await expect(invoke()).rejects.toThrow("permission denied");
    expect(await adapter.fetch(remoteId)).toEqual({ remoteId, status: "regular" });
  });

  it("waits for a successful archive when binding notifications trigger a reload", async () => {
    const { binding } = createBinding();
    binding.getThreadListSnapshot = () => ({ threads: [], archivedThreads: [] });
    const { adapter } = createConversationRemoteThreadListAdapter(binding);
    const { remoteId } = await adapter.initialize("local");
    let reload: ReturnType<typeof adapter.list> | undefined;
    binding.archiveThread = async () => { reload = adapter.list(); };
    await adapter.archive(remoteId);
    expect((await reload!).threads).toEqual([{ remoteId, status: "archived" }]);
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


describe("conversation deletion tombstones", () => {
  it("never recreates a deleted initialId through the initial fallback", async () => {
    const { binding } = createBinding();
    // No snapshot metadata: fetch can only use the initialId fallback.
    binding.getThreadListSnapshot = () => ({ threads: [], archivedThreads: [] });
    binding.deleteThread = vi.fn(async () => undefined);
    const { adapter, initialId } = createConversationRemoteThreadListAdapter(binding);
    await expect(adapter.fetch(initialId)).resolves.toMatchObject({ remoteId: initialId });
    await adapter.delete(initialId);
    await expect(adapter.fetch(initialId)).rejects.toThrow(`Conversation "${initialId}" was deleted.`);
    expect((await adapter.list()).threads).toEqual([]);
  });

  it("filters deleted regular and archived ids from a stale binding snapshot", async () => {
    const { binding } = createBinding();
    binding.getThreadListSnapshot = () => ({
      threads: [{ id: "live", status: "regular" }, { id: "history", status: "regular" }],
      archivedThreads: [{ id: "archived", status: "archived" }],
    });
    binding.deleteThread = vi.fn(async () => undefined);
    const { adapter } = createConversationRemoteThreadListAdapter(binding);
    await adapter.fetch("history");
    await adapter.delete("history");
    await adapter.delete("archived");
    expect((await adapter.list()).threads.map(item => item.remoteId)).toEqual(["live"]);
    await expect(adapter.fetch("history")).rejects.toThrow("was deleted");
    await expect(adapter.fetch("archived")).rejects.toThrow("was deleted");
  });

  it("does not tombstone the initial id after a failed deletion", async () => {
    const { binding } = createBinding();
    binding.getThreadListSnapshot = () => ({ threads: [], archivedThreads: [] });
    binding.deleteThread = vi.fn(async () => { throw new Error("delete failed"); });
    const { adapter, initialId } = createConversationRemoteThreadListAdapter(binding);
    await adapter.fetch(initialId);
    await expect(adapter.delete(initialId)).rejects.toThrow("delete failed");
    await expect(adapter.fetch(initialId)).resolves.toMatchObject({ remoteId: initialId });
    expect((await adapter.list()).threads.map(item => item.remoteId)).toEqual([initialId]);
  });

  it("does not cache a metadata read that completes after deletion", async () => {
    const { binding } = createBinding();
    let resolve!: (item: { id: string; status: "regular" }) => void;
    binding.getThreadMetadata = () => new Promise(done => { resolve = done; });
    binding.deleteThread = vi.fn(async () => undefined);
    const { adapter } = createConversationRemoteThreadListAdapter(binding);
    const reading = adapter.fetch("late");
    const rejected = expect(reading).rejects.toThrow('Conversation "late" was deleted.');
    await adapter.delete("late");
    resolve({ id: "late", status: "regular" });
    await rejected;
    expect((await adapter.list()).threads.some(item => item.remoteId === "late")).toBe(false);
  });
});
