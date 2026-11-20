// @vitest-environment jsdom
import { useAui, type AssistantRuntime } from "@assistant-ui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ConversationRuntimeProvider } from "@za38.03/agent-ui-runtime";
import { useComposer, usePluginService, createComposerInputController, type ComposerController } from "../src/index.js";
import { PluginServiceRuntimeProvider } from "../src/plugin-api/PluginServiceContext.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); });
function mount() { const host = document.createElement("div"); document.body.append(host); root = createRoot(host); return host; }
async function until(check: () => boolean) {
  for (let index = 0; index < 100; index++) {
    if (check()) return;
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  }
  throw new Error("Selector fixture did not settle");
}

it("keeps command-only Composer consumers passive and selects independent draft fields", async () => {
  let native!: AssistantRuntime;
  let composer!: ComposerController;
  const renders = { imperative: 0, length: 0, quote: 0 };
  function Capture() { native = useAui().threads.__internal_getAssistantRuntime!(); return null; }
  function Imperative() { composer = useComposer("shared"); renders.imperative++; return null; }
  function Length() { const length = useComposer(state => state.text.length, "shared"); renders.length++; return <span>{length}</span>; }
  function Quote() { useComposer(state => state.quote?.text, "shared"); renders.quote++; return null; }
  const host = mount();
  await act(async () => root!.render(<ConversationRuntimeProvider endpoint="http://example.test/unused"
    inputControllerFactory={createComposerInputController}
    threadBinding={{ getThreadId: () => "A", subscribe: () => () => {}, createNewThread: async () => "new", loadThread: async () => ({ messages: [] }) }}>
    <Capture /><Imperative /><Length /><Quote />
  </ConversationRuntimeProvider>));
  await until(() => !!native && !native.thread.getState().isLoading);
  const before = { ...renders };
  const handle = composer;
  await act(async () => composer.setText("first"));
  expect(host.textContent).toBe("5");
  expect(renders).toEqual({ ...before, length: before.length + 1 });
  await act(async () => composer.setText("other"));
  expect(renders).toEqual({ ...before, length: before.length + 1 });
  expect(composer).toBe(handle);
  expect(composer.getSnapshot().text).toBe("other");
  expect(composer.getState()).toBe(composer.getSnapshot());
  await act(async () => composer.setQuote({ text: "quoted", messageId: "message" }));
  expect(renders).toEqual({ imperative: before.imperative, length: before.length + 1, quote: before.quote + 1 });
  const listener = vi.fn();
  const stop = composer.subscribe(listener);
  await act(async () => composer.setText("last"));
  expect(listener).toHaveBeenCalled();
  stop(); listener.mockClear();
  await act(async () => composer.setText("next"));
  expect(listener).not.toHaveBeenCalled();
});

it("supports passive service handles and selected values without a registry Provider", async () => {
  let snapshot = { selected: "A", unrelated: 0 };
  const listeners = new Set<() => void>();
  const service = {
    getSnapshot: vi.fn(() => snapshot),
    subscribe: vi.fn((listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; }),
  };
  let handle: typeof service | undefined;
  const renders = { passive: 0, selected: 0 };
  function Passive() { handle = usePluginService(service); renders.passive++; return null; }
  function Selected() { const selected = usePluginService(service, state => state.selected); renders.selected++; return <span>{selected}</span>; }
  const host = mount();
  await act(async () => root!.render(<><Passive /><Selected /></>));
  expect(listeners.size).toBe(1);
  expect(handle).toBe(service);
  await act(async () => { snapshot = { ...snapshot, unrelated: 1 }; listeners.forEach(listener => listener()); });
  expect(renders).toEqual({ passive: 1, selected: 1 });
  await act(async () => { snapshot = { ...snapshot, selected: "B" }; listeners.forEach(listener => listener()); });
  expect(host.textContent).toBe("B");
  expect(renders).toEqual({ passive: 1, selected: 2 });
  expect(handle!.getSnapshot().selected).toBe("B");
  await act(async () => root!.unmount()); root = undefined;
  expect(listeners.size).toBe(0);
});

it("switches a service call between imperative and selected modes without leaking subscriptions", async () => {
  const listeners = new Set<() => void>();
  const service = { getSnapshot: () => 1, subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; } };
  function Consumer({ selector }: { selector: ((state: number) => number) | undefined }) { usePluginService(service, selector); return null; }
  mount();
  await act(async () => root!.render(<Consumer selector={undefined} />));
  expect(listeners.size).toBe(0);
  await act(async () => root!.render(<Consumer selector={state => state} />));
  expect(listeners.size).toBe(1);
  await act(async () => root!.render(<Consumer selector={undefined} />));
  expect(listeners.size).toBe(0);
});

it("selects a named service and follows removal using the declared fallback", async () => {
  let snapshot = { count: 1, unrelated: 0 };
  const listeners = new Set<() => void>();
  const registryListeners = new Set<() => void>();
  const service = { getSnapshot: () => snapshot, subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; } };
  let available = true;
  const registry = {
    get: <T,>() => available ? service as unknown as T : undefined,
    subscribe(listener: () => void) { registryListeners.add(listener); return () => { registryListeners.delete(listener); }; },
    getRevision: () => 0,
  };
  const fallback = { count: 0, unrelated: 0 };
  let renders = 0;
  function Consumer() { const count = usePluginService("test.counter", state => state.count, fallback); renders++; return <span>{count}</span>; }
  const host = mount();
  await act(async () => root!.render(<PluginServiceRuntimeProvider runtime={registry}><Consumer /></PluginServiceRuntimeProvider>));
  expect(host.textContent).toBe("1");
  await act(async () => { snapshot = { ...snapshot, unrelated: 1 }; listeners.forEach(listener => listener()); });
  expect(renders).toBe(1);
  await act(async () => { available = false; registryListeners.forEach(listener => listener()); });
  expect(host.textContent).toBe("0");
  expect(listeners.size).toBe(0);
  await act(async () => root!.unmount()); root = undefined;
  expect(registryListeners.size).toBe(0);
});
