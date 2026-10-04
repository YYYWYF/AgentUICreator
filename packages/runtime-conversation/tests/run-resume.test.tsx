import { useAui, type AssistantRuntime } from "@assistant-ui/react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import { ConversationRuntimeProvider } from "../src/ConversationRuntimeProvider.js";
import type { ConversationLoadedThread, ConversationThreadBinding } from "../src/threads/types.js";

const pause = () => new Promise<void>(resolve => setTimeout(resolve, 10));
async function until(predicate: () => boolean) {
  for (let index = 0; index < 100; index += 1) {
    if (predicate()) return;
    await pause();
  }
  throw new Error("Timed out waiting for conversation resume");
}

const user = (id: string) => ({
  id: `${id}-user`, role: "user" as const, content: [{ type: "text", text: "long task" }],
  attachments: [], createdAt: new Date(0), metadata: { custom: {} },
});
const partial = (id: string) => ({
  id: `${id}-partial`, role: "assistant" as const,
  content: [{ type: "text", text: "正在分析 A" }],
  status: { type: "incomplete", reason: "other" }, createdAt: new Date(0),
  metadata: { unstable_state: null, unstable_annotations: [], unstable_data: [], steps: [], custom: {} },
});

async function fixture(histories: Record<string, ConversationLoadedThread>) {
  let runtime!: AssistantRuntime;
  let renderer!: ReactTestRenderer;
  const runAgent = vi.fn(async () => undefined);
  const abortRun = vi.fn();
  const errors: Error[] = [];
  const loadThread = vi.fn(async (id: string) => histories[id]!);
  const binding: ConversationThreadBinding = {
    getThreadId: () => "A",
    subscribe: () => () => {},
    createNewThread: async () => crypto.randomUUID(),
    loadThread,
    getThreadListSnapshot: () => ({
      threads: Object.keys(histories).map(id => ({ id, status: "regular" as const })),
      archivedThreads: [],
    }),
  };
  function Capture() {
    runtime = useAui().threads.__internal_getAssistantRuntime!();
    return null;
  }
  await act(async () => {
    renderer = create(
      <ConversationRuntimeProvider endpoint="http://example.test/agent" threadBinding={binding}
        onError={error => errors.push(error)}
        unstable_agentFactory={({ threadId }) => ({ threadId, runAgent, abortRun,
          subscribe: () => ({ unsubscribe: () => {} }) }) as never}>
        <Capture />
      </ConversationRuntimeProvider>,
    );
    await pause();
  });
  const text = (id: string) => runtime.threads.getById(id).getState().messages
    .flatMap(message => message.role === "assistant" ? message.content : [])
    .filter(part => part.type === "text").map(part => part.text).join("");
  return {
    runtime, text, runAgent, abortRun, errors, loadThread,
    switchTo: async (id: string) => { await act(async () => { await runtime.threads.switchToThread(id); }); },
    dispose: async () => { await act(async () => {
      for (const id of Object.keys(histories)) {
        try { if (runtime.threads.getById(id).getState().isRunning) runtime.threads.getById(id).cancelRun(); } catch {}
      }
      renderer.unmount();
    }); },
  };
}

describe("existing run resumption", () => {
  it("loads ordinary and running-looking history without guessing a resume", async () => {
    const f = await fixture({ A: { messages: [user("A"), partial("A")] } });
    try {
      await until(() => f.text("A").includes("正在分析 A"));
      expect(f.runAgent).not.toHaveBeenCalled();
      expect(f.text("A")).toBe("正在分析 A");
    } finally { await f.dispose(); }
  });

  it("continues the original run with snapshot updates and never invokes the Agent", async () => {
    const stream = vi.fn(async function* (_signal: AbortSignal) {
      yield "、B";
      yield "、B 和 C";
    });
    const f = await fixture({ A: { messages: [user("A"), partial("A")], resume: { stream } } });
    try {
      await until(() => f.text("A").includes("和 C"));
      expect(f.text("A")).toBe("正在分析 A、B 和 C");
      expect(stream).toHaveBeenCalledOnce();
      expect(f.runAgent).not.toHaveBeenCalled();
    } finally { await f.dispose(); }
  });

  it("keeps persisted history and reports a failed resume without rerunning", async () => {
    const f = await fixture({ A: { messages: [user("A"), partial("A")], resume: {
      async *stream() { throw new Error("resume failed"); },
    } } });
    try {
      await until(() => f.errors.length > 0);
      expect(f.text("A")).toContain("正在分析 A");
      expect(f.errors[0]?.message).toBe("resume failed");
      expect(f.runAgent).not.toHaveBeenCalled();
    } finally { await f.dispose(); }
  });

  it("passes Stop to the resumed stream and does not render later updates", async () => {
    let signal: AbortSignal | undefined;
    let stopped = false;
    const stream = vi.fn(async function* (resumeSignal: AbortSignal) {
      signal = resumeSignal;
      yield "、B";
      await new Promise<void>(resolve => resumeSignal.addEventListener("abort", () => { stopped = true; resolve(); }, { once: true }));
      yield "should not render";
    });
    const f = await fixture({ A: { messages: [user("A"), partial("A")], resume: { stream } } });
    try {
      await until(() => f.text("A").includes("、B"));
      await act(async () => { f.runtime.thread.cancelRun(); await pause(); });
      expect(signal?.aborted).toBe(true);
      expect(stopped).toBe(true);
      expect(f.text("A")).not.toContain("should not render");
      expect(f.runAgent).not.toHaveBeenCalled();
    } finally { await f.dispose(); }
  });

  it("keeps each loaded capability with its own thread during navigation", async () => {
    let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    const aStream = vi.fn(async function* (signal: AbortSignal) {
      yield "、B";
      await wait;
      if (!signal.aborted) yield "、B 和 C";
    });
    const f = await fixture({
      A: { messages: [user("A"), partial("A")], resume: { stream: aStream } },
      B: { messages: [user("B"), partial("B")] },
    });
    try {
      await until(() => f.text("A").includes("、B"));
      await f.switchTo("B");
      release();
      await until(() => f.text("A").includes("和 C"));
      expect(f.text("B")).toBe("正在分析 A");
      expect(f.runAgent).not.toHaveBeenCalled();
      expect(aStream).toHaveBeenCalledOnce();
    } finally { release(); await f.dispose(); }
  });
});
