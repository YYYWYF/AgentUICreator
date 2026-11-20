// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { AgentRuntime, AgentRuntimeSnapshot } from "@za38.03/agent-ui-core";
import { AgentRuntimeContext } from "../src/agent-context/AgentRuntimeContext.js";
import { useAgentRuntime, type AgentRuntimeController } from "../src/agent-context/agent-runtime-hooks.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); });

it("isolates Runtime selectors while imperative commands always see the current snapshot", async () => {
  type State = { selected: string; unrelated: number };
  let snapshot: AgentRuntimeSnapshot<State> = {
    conversation: { id: "A" }, messages: [], state: { selected: "first", unrelated: 0 },
    run: { status: "idle" }, executions: [], interrupts: [],
  };
  const listeners = new Set<() => void>();
  const runtime: AgentRuntime<State> = {
    mode: "test", getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    subscribeApplicationEvents: () => () => {},
    sendMessage: vi.fn(async () => {}), resumeInterrupts: vi.fn(async () => {}), startNewConversation: vi.fn(async () => {}),
    abort: vi.fn(), dispose: vi.fn(),
  };
  let controller!: AgentRuntimeController<State>;
  const renders = { handle: 0, selected: 0, status: 0 };
  function Handle() { controller = useAgentRuntime<State>(); renders.handle++; return null; }
  function Selected() { const value = useAgentRuntime<string, State>(state => state.state.selected); renders.selected++; return <span>{value}</span>; }
  function Status() { useAgentRuntime(state => state.run.status); renders.status++; return null; }
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(<AgentRuntimeContext.Provider value={runtime}><Handle /><Selected /><Status /></AgentRuntimeContext.Provider>));
  expect(listeners.size).toBe(2);
  await act(async () => { snapshot = { ...snapshot, state: { ...snapshot.state, unrelated: 1 } }; listeners.forEach(listener => listener()); });
  expect(renders).toEqual({ handle: 1, selected: 1, status: 1 });
  await act(async () => { snapshot = { ...snapshot, state: { ...snapshot.state, selected: "second" } }; listeners.forEach(listener => listener()); });
  expect(host.textContent).toBe("second");
  expect(renders).toEqual({ handle: 1, selected: 2, status: 1 });
  expect(controller.getSnapshot().state.unrelated).toBe(1);
  await controller.sendMessage("question"); controller.abortRun();
  expect(runtime.sendMessage).toHaveBeenCalledWith("question");
  expect(runtime.abort).toHaveBeenCalledOnce();
  await act(async () => root!.unmount()); root = undefined;
  expect(listeners.size).toBe(0);
});
