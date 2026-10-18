import { StrictMode, useEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import type { AgentRuntime, AgentRuntimeSnapshot } from "@za38.03/agent-ui-core";
import {
  AgentUIProvider, AgentUIRuntimeBinding, AgentUIConnectionState,
  useAgentUI, useAgentUIState, useAgentUIEvent, useAgentUIUser, type AgentUIHost,
} from "../src/host/AgentUIProvider.js";

function source(id: string) {
  let snapshot: AgentRuntimeSnapshot = { conversation: { id }, messages: [], state: {}, run: { status: "idle" }, executions: [], interrupts: [] };
  const listeners = new Set<() => void>();
  const runtime: AgentRuntime = {
    mode: "test", getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    subscribeApplicationEvents: () => () => {}, sendMessage: vi.fn(async () => {}),
    startNewConversation: vi.fn(async () => {}), resumeInterrupts: vi.fn(async () => {}),
    abort: vi.fn(), dispose: vi.fn(),
  };
  return { runtime, listeners, update(run: AgentRuntimeSnapshot["run"]) { snapshot = { ...snapshot, run }; for (const listener of listeners) listener(); } };
}

describe("package-owned Host provider", () => {
  it("keeps a stable Host facade, delegates actions and distinguishes run end from success", async () => {
    const active = source("A");
    let host!: AgentUIHost;
    const ended = vi.fn();
    function Probe() {
      host = useAgentUI();
      useAgentUIEvent("run-end", ended);
      const status = useAgentUIState(s => s.runtime?.run.status);
      return <span>{status}</span>;
    }
    let tree!: ReactTestRenderer;
    await act(async () => { tree = create(<AgentUIProvider><Probe /><AgentUIRuntimeBinding runtime={active.runtime} /></AgentUIProvider>); });
    const stable = host;
    try {
      expect(host.getSnapshot().status).toBe("ready");
      await host.sendMessage("hello");
      expect(active.runtime.sendMessage).toHaveBeenCalledWith("hello");
      await host.startNewConversation(); expect(active.runtime.startNewConversation).toHaveBeenCalledOnce();
      host.abortRun(); expect(active.runtime.abort).toHaveBeenCalledOnce();
      await act(async () => active.update({ status: "running", id: "run-1" }));
      await act(async () => active.update({ status: "awaiting-input", id: "run-1" }));
      expect(host).toBe(stable);
      expect(ended).toHaveBeenCalledWith({ threadId: "A", run: { status: "awaiting-input", id: "run-1" } });
      expect(tree.root.findByType("span").children).toEqual(["awaiting-input"]);
      await act(async () => active.update({ status: "running", id: "run-2" }));
      await act(async () => active.update({ status: "error", error: { code: "TEST", message: "test" } }));
      expect(ended).toHaveBeenLastCalledWith(expect.objectContaining({ run: expect.objectContaining({ status: "error" }) }));
    } finally { await act(async () => tree.unmount()); }
    expect(active.listeners.size).toBe(0);
    await expect(host.sendMessage("late")).rejects.toMatchObject({ code: "AGENT_UI_NOT_READY" });
  });

  it("keeps Host children mounted while initializing/blocked, projects optional user data and isolates providers", async () => {
    const a = source("A"); const b = source("B");
    const mounts = vi.fn(); const unmounts = vi.fn();
    let first!: AgentUIHost; let second!: AgentUIHost; let user: unknown;
    function First() { first = useAgentUI(); user = useAgentUIUser(); useEffect(() => { mounts(); return unmounts; }, []); return null; }
    function Second() { second = useAgentUI(); return null; }
    let tree!: ReactTestRenderer;
    const view = (ready: boolean) => <>
      <AgentUIProvider user={{ userName: ready ? "Updated" : "Initial", token: "secret" } as never}>
        <First />{ready ? <AgentUIRuntimeBinding runtime={a.runtime} /> : <AgentUIConnectionState status="blocked" />}
      </AgentUIProvider>
      <AgentUIProvider><Second /><AgentUIRuntimeBinding runtime={b.runtime} /></AgentUIProvider>
    </>;
    await act(async () => { tree = create(view(false)); });
    try {
      await expect(first.sendMessage("early")).rejects.toMatchObject({ code: "AGENT_UI_NOT_READY" });
      expect(second.getSnapshot().runtime?.conversation.id).toBe("B");
      expect(user).toEqual({ userId: undefined, userName: "Initial", avatar: undefined });
      await act(async () => tree.update(view(true)));
      expect(mounts).toHaveBeenCalledTimes(1); expect(unmounts).not.toHaveBeenCalled();
      expect(first.getSnapshot().runtime?.conversation.id).toBe("A");
      expect(user).toEqual({ userId: undefined, userName: "Updated", avatar: undefined });
      await first.sendMessage("A only"); expect(b.runtime.sendMessage).not.toHaveBeenCalled();
      await act(async () => tree.update(view(false)));
      expect(first.getSnapshot().status).toBe("blocked");
      expect(first.getSnapshot().runtime).toBeNull();
      expect(unmounts).not.toHaveBeenCalled();
    } finally { await act(async () => tree.unmount()); }
  });

  it("rejects pending work on replacement/unmount without forwarding it to another session", async () => {
    const a = source("A"); const b = source("B");
    vi.mocked(a.runtime.sendMessage).mockImplementation(() => new Promise(() => {}));
    let host!: AgentUIHost; let tree!: ReactTestRenderer;
    function Probe() { host = useAgentUI(); return null; }
    const view = (runtime: AgentRuntime) => <StrictMode><AgentUIProvider><Probe /><AgentUIRuntimeBinding runtime={runtime} /></AgentUIProvider></StrictMode>;
    await act(async () => { tree = create(view(a.runtime)); });
    const pending = host.sendMessage("A");
    const rejected = expect(pending).rejects.toMatchObject({ code: "AGENT_UI_SESSION_ENDED" });
    await act(async () => tree.update(view(b.runtime))); await rejected;
    expect(b.runtime.sendMessage).not.toHaveBeenCalled();
    expect(host.getSnapshot().runtime?.conversation.id).toBe("B");
    vi.mocked(b.runtime.sendMessage).mockImplementation(() => new Promise(() => {}));
    const final = expect(host.sendMessage("B")).rejects.toMatchObject({ code: "AGENT_UI_SESSION_ENDED" });
    await act(async () => tree.unmount()); await final;
    expect(a.listeners.size).toBe(0); expect(b.listeners.size).toBe(0);
    expect(b.runtime.abort).toHaveBeenCalled();
  });
});
