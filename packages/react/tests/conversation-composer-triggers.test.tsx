// @vitest-environment jsdom
import { useAui, type AssistantRuntime } from "@assistant-ui/react";
import type { RunAgentInput } from "@ag-ui/client";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ConversationRuntimeProvider, createEphemeralConversationThreadBinding } from "@agent-ui/runtime-conversation";
import { CancellationAwareHttpAgent } from "../../runtime-conversation/src/compatibility/cancellation-aware-http-agent.js";
import { AgentUIRoot, ConversationThread, ConversationCanonicalComposer, ConversationComposerMentionTrigger, ConversationComposerCommandTrigger, type ConversationMentionSource, type ConversationSlashCommand, type ConversationTriggerLabels } from "../src/index.js";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const labels: ConversationTriggerLabels = { suggestions: "Suggestions", back: "Back", empty: "No matches", loading: "Loading", searchFailed: "Search failed", retry: "Retry", commandFailed: "Command failed", invalidItem: "Invalid item" };
let root: Root | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function until(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); }); }
  throw new Error("Timed out waiting for Composer trigger UI");
}
async function mount(source?: ConversationMentionSource, commands: readonly ConversationSlashCommand[] = [], disabled = false) {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value() {} });
  let runtime!: AssistantRuntime;
  const requests: RunAgentInput[] = [];
  let mention = true, slash = true;
  const commandSource = { getSnapshot: () => commands, subscribe: () => () => {} };
  const agentFactory = () => new CancellationAwareHttpAgent({ url: "http://example.test/agent", fetch: async (_url, init) => {
    const input = JSON.parse(String(init.body)) as RunAgentInput; requests.push(input);
    return new Response([{ type: "RUN_STARTED", threadId: input.threadId, runId: input.runId }, { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId }].map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
  } });
  const binding = { ...createEphemeralConversationThreadBinding(), getThreadIsDisabled: () => disabled };
  function Capture() { runtime = useAui().threads.__internal_getAssistantRuntime!(); return null; }
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const render = () => root!.render(<ConversationRuntimeProvider endpoint="http://example.test/agent" threadBinding={binding} unstable_agentFactory={agentFactory}>
    <AgentUIRoot theme="dark"><Capture /><ConversationThread autoFocus={false} composer={<ConversationCanonicalComposer autoFocus={false} triggers={<>
      {mention && <ConversationComposerMentionTrigger source={source} labels={labels} debounceMs={1} />}
      {slash && <ConversationComposerCommandTrigger source={commandSource} labels={labels} />}
    </>} />} /></AgentUIRoot>
  </ConversationRuntimeProvider>);
  await act(async () => { render(); });
  await until(() => !runtime.thread.getState().isLoading);
  const type = async (text: string, cursor = text.length) => {
    await act(async () => runtime.thread.composer.setText(text));
    const input = host.querySelector("textarea")!;
    await act(async () => { input.focus(); input.setSelectionRange(0, 0); document.dispatchEvent(new Event("selectionchange")); input.setSelectionRange(cursor, cursor); document.dispatchEvent(new Event("selectionchange")); input.dispatchEvent(new MouseEvent("mouseup", { bubbles: true })); });
  };
  const choose = async (label: string) => {
    try { await until(() => [...host.querySelectorAll('[role="option"]')].some(element => element.textContent!.includes(label))); } catch { throw new Error(`Missing option ${label}: ${host.textContent}; text=${runtime.thread.composer.getState().text}`); }
    const option = [...host.querySelectorAll('[role="option"]')].find(element => element.textContent!.includes(label))! as HTMLElement;
    await act(async () => { option.click(); });
  };
  const remove = async (feature: "mention" | "slash") => { if (feature === "mention") mention = false; else slash = false; await act(async () => render()); };
  const replaceSource = async (next: ConversationMentionSource) => { source = next; await act(async () => render()); };
  return { host, runtime, requests, type, choose, remove, replaceSource };
}
it("searches Mention asynchronously, sends the stable ID through HttpAgent and retains historical chips after removal", async () => {
  const search = vi.fn(async () => [{ id: "employee_84721", type: "user", label: "Zhang San" }]);
  const { host, runtime, requests, type, choose, remove } = await mount({ cacheKey: "roster", search });
  await type("@Zhang"); await choose("Zhang San");
  expect(search.mock.calls.length).toBeGreaterThan(0);
  expect(runtime.thread.composer.getState().text.trim()).toBe(":user[Zhang San]{name=employee_84721}");
  expect(requests).toHaveLength(0);
  await act(async () => { runtime.thread.composer.send(); }); await until(() => requests.length === 1 && !runtime.thread.getState().isRunning);
  expect(requests[0]!.messages.find(message => message.role === "user")!.content).toBe(":user[Zhang San]{name=employee_84721} ");
  expect(host.querySelector('[data-directive-id="employee_84721"]')!.textContent).toBe("@Zhang San");
  await remove("mention"); await type("@Zhang");
  expect(host.querySelector('[role="listbox"]')).toBeNull();
  expect(host.querySelector('[data-directive-id="employee_84721"]')).not.toBeNull();
});
it("mixes action and directive commands, preserves surrounding text, and keeps Mention independent", async () => {
  const execute = vi.fn();
  const { runtime, requests, type, choose, remove, host } = await mount({ cacheKey: "roster", search: async () => [{ id: "one", type: "user", label: "Person" }] }, [
    { id: "new", label: "New conversation", mode: "action", execute },
    { id: "summarize", label: "Summarize", mode: "directive" },
  ]);
  await type("before /sum after", 11); await choose("Summarize");
  expect(runtime.thread.composer.getState().text).toBe("before :command[Summarize]{name=summarize} after");
  expect(execute).not.toHaveBeenCalled(); expect(requests).toHaveLength(0);
  await act(async () => { runtime.thread.composer.send(); }); await until(() => requests.length === 1 && !runtime.thread.getState().isRunning);
  expect(requests[0]!.messages.find(message => message.role === "user")!.content).toBe("before :command[Summarize]{name=summarize} after");
  await type("before /new after", 11); await choose("New conversation");
  await until(() => execute.mock.calls.length === 1);
  expect(runtime.thread.composer.getState().text).toBe("before after");
  expect(requests).toHaveLength(1);
  await remove("slash"); await type("/sum"); expect(host.querySelector('[role="listbox"]')).toBeNull();
  await type("@Person"); await choose("Person");
  expect(runtime.thread.composer.getState().text).toContain(":user[Person]{name=one}");
});
it("aborts pending Mention requests on removal and ignores stale results", async () => {
  const pending = new Map<string, { signal: AbortSignal; resolve: (items: { id: string; type: string; label: string }[]) => void }>();
  const source: ConversationMentionSource = { cacheKey: "roster", search: ({ query, signal }) => new Promise(resolve => { pending.set(query, { signal, resolve }); }) };
  const { host, type, choose, remove } = await mount(source);
  await type("@old"); await until(() => pending.has("old"));
  await type("@new"); await until(() => pending.has("new"));
  expect(pending.get("old")!.signal.aborted).toBe(true);
  await act(async () => pending.get("new")!.resolve([{ id: "new", type: "user", label: "New person" }]));
  await act(async () => pending.get("old")!.resolve([{ id: "old", type: "user", label: "Old person" }]));
  expect(host.textContent).not.toContain("Old person"); await choose("New person");
  await type("@pending"); await until(() => pending.has("pending"));
  await remove("mention"); expect(pending.get("pending")!.signal.aborted).toBe(true);
});
it("does not register actionable triggers in readonly threads or when Mention has no source", async () => {
  const { host, type } = await mount(undefined, [{ id: "new", label: "New conversation", mode: "action", execute: vi.fn() }], true);
  await type("/new"); expect(host.querySelector('[role="listbox"]')).toBeNull();
});

it("invalidates Mention results when a different source reuses the same cache key", async () => {
  const first = { cacheKey: "same", search: async () => [{ id: "old", type: "user", label: "Old person" }] };
  const { host, type, replaceSource } = await mount(first);
  await type("@person"); await until(() => host.textContent!.includes("Old person"));
  await replaceSource({ cacheKey: "same", search: async () => [{ id: "new", type: "user", label: "New person" }] });
  await until(() => host.textContent!.includes("New person"));
  expect(host.textContent).not.toContain("Old person");
});
it("reports a failed Mention source and retries without changing the draft", async () => {
  const search = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue([{ id: "one", type: "user", label: "Person" }]);
  const { host, type, runtime } = await mount({ cacheKey: "one", search });
  await type("@Person"); await until(() => host.textContent!.includes("Search failed"));
  const retry = [...host.querySelectorAll("button")].find(button => button.textContent === "Retry")!;
  await act(async () => retry.click()); await until(() => host.querySelector('[role="option"]') !== null);
  expect(runtime.thread.composer.getState().text).toBe("@Person");
});
it("uses upstream keyboard selection, Escape, Tab, and composition Enter without sending", async () => {
  const { host, type, runtime, requests } = await mount({ cacheKey: "one", search: async () => [
    { id: "first", type: "user", label: "First" }, { id: "second", type: "user", label: "Second" },
  ] });
  const input = host.querySelector("textarea")!;
  const key = async (value: string, composing = false) => act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true, isComposing: composing }));
  });
  await type("@"); await until(() => host.querySelectorAll('[role="option"]').length === 2);
  await act(async () => input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })));
  await key("Enter", true); expect(runtime.thread.composer.getState().text).toBe("@"); expect(requests).toHaveLength(0);
  await act(async () => input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })));
  await key("ArrowDown"); await key("Enter");
  expect(runtime.thread.composer.getState().text).toContain(":user[Second]{name=second}"); expect(requests).toHaveLength(0);
  await type("@First"); await until(() => host.querySelector('[role="option"]') !== null);
  await key("Escape"); expect(host.querySelector('[role="listbox"]')).toBeNull();
  await type("@Second"); await until(() => host.querySelector('[role="option"]') !== null);
  await key("Tab"); expect(runtime.thread.composer.getState().text).toContain(":user[First]{name=first}");
  expect(requests).toHaveLength(0);
  expect(host.querySelector('[data-directive-id]')).toBeNull();
});
it("leaves unsupported historical directive text intact and has no Mention UI without a source", async () => {
  const { host, type, runtime, requests } = await mount();
  await type("@person"); expect(host.querySelector('[role="listbox"]')).toBeNull();
  await type(":custom[Raw]{name=id}"); await act(async () => runtime.thread.composer.send());
  await until(() => requests.length === 1 && !runtime.thread.getState().isRunning);
  expect(host.textContent).toContain(":custom[Raw]{name=id}"); expect(host.querySelector('[data-directive-id]')).toBeNull();
});
it("shows action failures without sending and ignores disabled commands", async () => {
  const { host, type, choose, requests } = await mount(undefined, [
    { id: "fail", label: "Fail", mode: "action", execute: async () => { throw new Error("action failed"); } },
    { id: "off", label: "Disabled", mode: "directive", disabled: true },
  ]);
  await type("/off"); expect(host.querySelector('[role="option"]')).toBeNull();
  await type("/fail"); await choose("Fail"); await until(() => host.textContent!.includes("Command failed"));
  expect(requests).toHaveLength(0);
});

it("refreshes an open Mention menu when the mounted source publishes a new cache key", async () => {
  const listeners = new Set<() => void>();
  let label = "Old person";
  const source: ConversationMentionSource = {
    cacheKey: 1, subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    search: async () => [{ id: "same", type: "user", label }],
  };
  const { host, type } = await mount(source);
  await type("@person"); await until(() => host.textContent!.includes("Old person"));
  await act(async () => { label = "New person"; source.cacheKey = 2; listeners.forEach(listener => listener()); });
  await until(() => host.textContent!.includes("New person"));
  expect(host.textContent).not.toContain("Old person");
});
it("aborts the captured Mention request when switching to a new thread", async () => {
  let signal: AbortSignal | undefined;
  const { runtime, type } = await mount({ cacheKey: "one", search: input => {
    signal = input.signal; return new Promise(() => {});
  } });
  await type("@person"); await until(() => signal !== undefined);
  await act(async () => runtime.threads.switchToNewThread());
  await until(() => signal!.aborted);
  expect(runtime.thread.composer.getState().text).toBe("");
});

it("preserves ordinary user text whitespace through the dormant directive renderer", async () => {
  const { host, runtime, type, requests } = await mount();
  const text = "first line\nsecond    line";
  await type(text); await act(async () => runtime.thread.composer.send());
  await until(() => requests.length === 1 && !runtime.thread.getState().isRunning);
  const rendered = host.querySelector('[data-role="user"] .whitespace-pre-wrap')!;
  expect(rendered.textContent).toBe(text);
  expect(requests[0]!.messages.find(message => message.role === "user")!.content).toBe(text);
});
