import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import {
  AgentUIProvider, AgentUIAgentProvider, useAgents, type AgentUIAgents} from "../src/host/AgentUIAgentsProvider.js";
import { useThreadNavigationBinding } from "../src/host/AgentUIProvider.js";
import type { AgentUIThreadNavigation } from "../src/host/threads.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function navigation(id: string) {
  return {
    createThread: vi.fn(async () => `${id}-new`),
    openThread: vi.fn(async (_threadId: string) => {}),
    sendComposer: vi.fn(async () => {}),
  };
}

async function fixture(a: AgentUIThreadNavigation, b = navigation("b")) {
  let agents!: AgentUIAgents;
  function Probe() { agents = useAgents(); return null; }
  function Navigation({ value }: { value: AgentUIThreadNavigation }) {
    useThreadNavigationBinding(value);
    return null;
  }
  const view = (revision: number) => <AgentUIProvider><Probe />
    <AgentUIAgentProvider key={revision} agentId="a"><Navigation value={a} /></AgentUIAgentProvider>
    <AgentUIAgentProvider agentId="b"><Navigation value={b} /></AgentUIAgentProvider>
  </AgentUIProvider>;
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(view(0)); });
  return {
    agents, b,
    async replaceA() { await act(async () => tree.update(view(1))); },
    async close() { await act(async () => tree.unmount()); },
  };
}

describe("per-assistant conversation navigation", () => {
  it.each(["openThread", "createThread"] as const)("keeps B's navigation independent while A's %s is pending", async operation => {
    const blocked = deferred<string>();
    const a = navigation("a");
    if (operation === "openThread") a.openThread.mockImplementationOnce(async () => { await blocked.promise; });
    else a.createThread.mockReturnValueOnce(blocked.promise);
    const f = await fixture(a);
    let pending!: Promise<unknown>;
    let backgroundWork: Promise<void>[] = [];
    try {
      await act(async () => {
        pending = operation === "openThread"
          ? f.agents.openThread({ agentId: "a", threadId: "slow-history" })
          : f.agents.createThread("a");
      });
      expect(a[operation]).toHaveBeenCalledOnce();
      let created: unknown;
      let opened = false;
      await act(async () => {
        backgroundWork = [
          f.agents.createThread("b").then(result => { created = result; }),
          f.agents.openThread({ agentId: "b", threadId: "b-history" }).then(() => { opened = true; }),
        ];
      });
      expect(created).toEqual({ agentId: "b", threadId: "b-new" });
      expect(opened).toBe(true);
      expect(f.b.openThread).toHaveBeenCalledWith("b-history");
    } finally {
      blocked.resolve("a-new");
      await pending;
      await Promise.allSettled(backgroundWork);
      await f.close();
    }
  });

  it("preserves navigation order within one assistant", async () => {
    const blocked = deferred<void>();
    const a = navigation("a");
    a.openThread.mockReturnValueOnce(blocked.promise);
    const f = await fixture(a);
    let opening!: Promise<void>, creating!: Promise<unknown>, reopening!: Promise<void>;
    try {
      await act(async () => {
        opening = f.agents.openThread({ agentId: "a", threadId: "first" });
        creating = f.agents.createThread("a");
        reopening = f.agents.openThread({ agentId: "a", threadId: "second" });
      });
      expect(a.openThread).toHaveBeenCalledExactlyOnceWith("first");
      expect(a.createThread).not.toHaveBeenCalled();
      blocked.resolve();
      await Promise.all([opening, creating, reopening]);
      expect(a.openThread).toHaveBeenNthCalledWith(2, "second");
      expect(a.createThread.mock.invocationCallOrder[0]).toBeLessThan(a.openThread.mock.invocationCallOrder[1]!);
    } finally {
      blocked.resolve();
      await Promise.allSettled([opening, creating, reopening]);
      await f.close();
    }
  });

  it("continues the same assistant's queue after a failed navigation", async () => {
    const a = navigation("a");
    a.openThread.mockRejectedValueOnce(new Error("history failed"));
    const f = await fixture(a);
    try {
      const opening = f.agents.openThread({ agentId: "a", threadId: "failed-history" });
      const creating = f.agents.createThread("a");
      await expect(opening).rejects.toThrow("history failed");
      await expect(creating).resolves.toEqual({ agentId: "a", threadId: "a-new" });
    } finally { await f.close(); }
  });

  it("lets a replacement assistant navigate without waiting for its retired registration", async () => {
    const blocked = deferred<void>();
    const a = navigation("a");
    a.openThread.mockReturnValueOnce(blocked.promise);
    const f = await fixture(a);
    let oldWork!: Promise<unknown[]>;
    try {
      await act(async () => {
        const opening = f.agents.openThread({ agentId: "a", threadId: "old-history" });
        const queued = f.agents.createThread("a");
        oldWork = Promise.all([
          expect(opening).rejects.toThrow("AGENT_UI_SESSION_ENDED"),
          expect(queued).rejects.toThrow("AGENT_UI_SESSION_ENDED"),
        ]);
      });
      await f.replaceA();
      let created: unknown;
      await act(async () => {
        void f.agents.createThread("a").then(result => { created = result; });
      });
      expect(created).toEqual({ agentId: "a", threadId: "a-new" });
      expect(a.createThread).toHaveBeenCalledOnce();
      blocked.resolve();
      await oldWork;
      expect(a.createThread).toHaveBeenCalledOnce();
    } finally {
      blocked.resolve();
      await oldWork;
      await f.close();
    }
  });
});
