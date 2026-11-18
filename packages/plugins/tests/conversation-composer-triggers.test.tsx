// @vitest-environment jsdom
import { useAui, type AssistantRuntime } from "@assistant-ui/react";
import type { RunAgentInput } from "@ag-ui/client";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConversationRuntimeProvider, createEphemeralConversationThreadBinding } from "@za38.03/agent-ui-runtime";
import { HttpAgent } from "@ag-ui/client";
import { AgentUILocaleProvider, AgentUIRoot, ConversationThread, ConversationCanonicalComposer, ConversationComposerMentionTrigger as NativeMention, ConversationComposerCommandTrigger as NativeCommand, type ConversationMentionSource, type ConversationSlashCommand, type ConversationMentionItem, type ConversationTriggerSelect, type ConversationTriggerRequestAdapter, type ComposerRequestAdapter, type ConversationCommandRequestItem } from "../src/index.js";
import {ConversationMentionTrigger as NpmMention} from "../dist/mention-trigger/index.js";
import {ConversationSlashCommandTrigger as NpmCommand} from "../dist/slash-command-trigger/index.js";
import {ConversationMentionTrigger as SourceMention} from "../dist/sources/takeover/mention-trigger/index";
import {ConversationSlashCommandTrigger as SourceCommand} from "../dist/sources/takeover/slash-command-trigger/index";
import { ConversationMentionTrigger as ProjectMention, source as projectMentionSource } from "../src/plugins/mention-trigger/adapters/application";
import { createConversationCommandRegistry } from "@za38.03/agent-ui-plugins/composer-triggers";
import { PluginInstanceContext, type PluginInstanceContextValue } from '@za38.03/agent-ui-runtime/plugin-api';
import { ConversationComposerLexicalInput } from '../src/lexical.js';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, type LexicalEditor } from 'lexical';
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const labels: import("../src/locale").AgentUILocaleMessages["conversationTriggers"] = { suggestions: "Suggestions", back: "Back", empty: "No matches", loading: "Loading", searchFailed: "Search failed", retry: "Retry", commandFailed: "Command failed", invalidItem: "Invalid item", newConversation: "New conversation" };
const sharedInstance: PluginInstanceContextValue = {
  instance: { id: 'composer-main', pluginId: 'composer', enabled: true },
  actions: { sendMessage: async () => {}, resumeInterrupts: async () => {}, startNewConversation: async () => {}, abortRun: () => {} },
  events: { subscribe: () => () => {} },
};
let root: Root | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function until(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); }); }
  throw new Error("Timed out waiting for Composer trigger UI");
}
describe.each([{name:"native",Mention:NativeMention,Command:NativeCommand},{name:"npm",Mention:NpmMention,Command:NpmCommand},{name:"portable",Mention:SourceMention,Command:SourceCommand},{name:"project",Mention:ProjectMention,Command:NpmCommand}])("$name", ({Mention:ConversationComposerMentionTrigger,Command:ConversationComposerCommandTrigger}) => {
async function mount(source?: ConversationMentionSource, commands: readonly ConversationSlashCommand[] = [], disabled = false, custom: {
  mentionSelect?: ConversationTriggerSelect<ConversationMentionItem>;
  commandSelect?: ConversationTriggerSelect<ConversationSlashCommand>;
  mentionData?: ConversationTriggerRequestAdapter<ConversationMentionItem>;
  commandData?: ConversationTriggerRequestAdapter<ConversationCommandRequestItem>;
  requestAdapter?: ComposerRequestAdapter;
  lexical?: boolean;
  sharedScope?: boolean;
} = {}) {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value() {} });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect() });
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
  let editor: LexicalEditor | undefined;
  function CaptureEditor() { [editor] = useLexicalComposerContext(); return null; }
  let runtime!: AssistantRuntime;
  const requests: RunAgentInput[] = [];
  let mention = true, slash = true;
  const commandSource = createConversationCommandRegistry();
  commands.forEach(command => commandSource.register(command));
  const agentFactory = () => new HttpAgent({ url: "http://example.test/agent", fetch: async (_url, init) => {
    const input = JSON.parse(String(init.body)) as RunAgentInput; requests.push(input);
    return new Response([{ type: "RUN_STARTED", threadId: input.threadId, runId: input.runId }, { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId }].map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
  } });
  const binding = { ...createEphemeralConversationThreadBinding(), getThreadIsDisabled: () => disabled };
  function Capture() { runtime = useAui().threads.__internal_getAssistantRuntime!(); return null; }
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const render = () => root!.render(<ConversationRuntimeProvider endpoint="http://example.test/agent" threadBinding={binding} unstable_agentFactory={agentFactory}>
    <AgentUIRoot theme="dark"><Capture /><AgentUILocaleProvider locale="en-US" messages={{conversationTriggers:labels}}><PluginInstanceContext.Provider value={custom.sharedScope ? sharedInstance : null}><ConversationThread autoFocus={false} composer={<ConversationCanonicalComposer requestAdapter={custom.requestAdapter} autoFocus={false} input={custom.lexical ? <ConversationComposerLexicalInput><CaptureEditor /></ConversationComposerLexicalInput> : undefined} triggers={<>
      {mention && <ConversationComposerMentionTrigger source={source} debounceMs={1} onSelect={custom.mentionSelect} requestAdapter={custom.mentionData} />}
      {slash && <ConversationComposerCommandTrigger source={commandSource} onSelect={custom.commandSelect} requestAdapter={custom.commandData} />}
    </>} />} /></PluginInstanceContext.Provider></AgentUILocaleProvider></AgentUIRoot>
  </ConversationRuntimeProvider>);
  await act(async () => { render(); });
  await until(() => !runtime.thread.getState().isLoading);
  const type = async (text: string, cursor = text.length) => {
    await act(async () => runtime.thread.composer.setText(text));
    if (editor) {
      await act(async () => {
        host.querySelector<HTMLElement>('[contenteditable="true"]')!.focus();
        editor!.update(() => { $getRoot().selectEnd(); });
      });
      return;
    }
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
  return { host, runtime, requests, type, choose, remove, replaceSource, commandSource };
}
it('lets project selection replace rich-editor insertion instead of being bypassed by the editor', async () => {
  const select = vi.fn<ConversationTriggerSelect<ConversationMentionItem>>(item => `CUSTOM(${item.id})`);
  const f = await mount({ search: async () => [{ id: 'one', type: 'user', label: 'Person' }] }, [], false,
    { lexical: true, mentionSelect: select });
  await f.type('@Person'); await f.choose('Person');
  expect(select).toHaveBeenCalledOnce();
  expect(f.runtime.thread.composer.getState().text.trim()).toBe('CUSTOM(one)');
  expect(f.requests).toHaveLength(0);
  await f.type(':user[Existing]{name=existing} before @Person'); await f.choose('Person');
  expect(f.runtime.thread.composer.getState().text.trim()).toBe(':user[Existing]{name=existing} before CUSTOM(one)');
  expect(select).toHaveBeenCalledTimes(2);
});
it('formats selected JSON in the Plugin and gives Composer full control over external fields and text', async () => {
  const item = { id: 'employee}custom', type: 'business.person', label: 'Custom person', data: { department: 'product' } };
  const selectionAdapter = vi.fn<ConversationTriggerRequestAdapter<ConversationMentionItem>>(item => ({ employeeId: item.id }));
  const requestAdapter = vi.fn<ComposerRequestAdapter>(({ request, pluginData, selections }) => ({
    ...request,
    messages: request.messages.map(message => message.role === 'user' ? { ...message, content: 'Custom question' } : message),
    forwardedProps: { business: pluginData, raw: selections },
  }));
  const f = await mount({ search: async () => [item] }, [], false, { mentionData: selectionAdapter, requestAdapter });
  await f.type('before @Custom after', 14); await f.choose('Custom person');
  expect(selectionAdapter).toHaveBeenCalledWith(item);
  expect(requestAdapter).not.toHaveBeenCalled(); expect(f.requests).toHaveLength(0);
  await act(async () => f.runtime.thread.composer.send());
  await until(() => f.requests.length === 1 && !f.runtime.thread.getState().isRunning);
  expect(requestAdapter.mock.calls[0]![0].request.messages[0]!.content).toBe('before  after');
  expect(f.requests[0]!.messages[0]!.content).toBe('Custom question');
  expect(f.requests[0]!.forwardedProps).toEqual({ business: { 'standalone:mention': [{ employeeId: item.id }] }, raw: { 'standalone:mention': [item] } });
  expect(JSON.stringify(f.requests[0])).not.toContain('agent-ui-selection-');
  expect(JSON.stringify(f.requests[0])).not.toContain('agentUIComposerData');
  expect(f.host.textContent).toContain('@Custom person');
});
it('replaces both slash modes, can suppress default actions, and reports selection failures without fallback', async () => {
  const execute = vi.fn();
  const onSelect = vi.fn<ConversationTriggerSelect<ConversationSlashCommand>>(command => {
    if (command.id === 'fail') throw new Error('Project selection failed');
    return command.mode === 'action' ? null : `PROJECT(${command.id})`;
  });
  const f = await mount(undefined, [
    { id: 'custom}id', label: 'Custom directive', mode: 'directive', data: { operation: 'summary' } },
    { id: 'act', label: 'Custom action', mode: 'action', execute },
    { id: 'fail', label: 'Fail command', mode: 'action', execute },
  ], false, { commandSelect: onSelect });
  await f.type('before /Custom after', 14); await f.choose('Custom directive');
  expect(f.runtime.thread.composer.getState().text).toBe('before PROJECT(custom}id) after');
  await f.type('/act'); await f.choose('Custom action');
  expect(f.runtime.thread.composer.getState().text).toBe('');
  expect(execute).not.toHaveBeenCalled(); expect(f.requests).toHaveLength(0);
  await f.type('/fail'); await f.choose('Fail command');
  expect(f.runtime.thread.composer.getState().text).toBe('/fail');
  expect(f.host.textContent).toContain('Command failed');
  expect(execute).not.toHaveBeenCalled();
});
it('keeps the mention draft on callback failure and allows removal without inserting a default reference', async () => {
  const onSelect = vi.fn<ConversationTriggerSelect<ConversationMentionItem>>(item => {
    if (item.id === 'fail') throw new Error('Project selection failed');
    return null;
  });
  const f = await mount({ search: async () => [
    { id: 'fail', type: 'user', label: 'Fail person' },
    { id: 'remove', type: 'user', label: 'Remove person' },
  ] }, [], false, { mentionSelect: onSelect });
  await f.type('@Fail'); await f.choose('Fail person');
  expect(f.runtime.thread.composer.getState().text).toBe('@Fail');
  expect(f.host.textContent).toContain('Invalid item');
  await f.type('@Remove'); await f.choose('Remove person');
  expect(f.runtime.thread.composer.getState().text).toBe('');
  expect(f.requests).toHaveLength(0);
});
it('collects @ and / data independently and assembles it once in Composer on keyboard submission', async () => {
  const mentionData: ConversationTriggerRequestAdapter<ConversationMentionItem> = item => ({ employeeId: item.id });
  const commandData = vi.fn<ConversationTriggerRequestAdapter<ConversationCommandRequestItem>>(item => ({ command: item.id }));
  const requestAdapter = vi.fn<ComposerRequestAdapter>(({ request, pluginData }) => ({
    ...request, context: [{ description: 'project', value: 'custom-context' }],
    forwardedProps: { ctx: { employees: pluginData['composer-main:mention'], action: pluginData['composer-main:command'] } },
  }));
  const f = await mount({ search: async () => [{ id: 'one', type: 'user', label: 'Person' }] }, [
    { id: 'summarize', label: 'Summary', mode: 'directive', data: { strategy: 'short' } },
  ], false, { mentionData, commandData, requestAdapter, sharedScope: true });
  await f.type('@Person'); await f.choose('Person');
  await f.type(`${f.runtime.thread.composer.getState().text}/sum`); await f.choose('Summary');
  await f.type(`${f.runtime.thread.composer.getState().text}Question`);
  const input = f.host.querySelector('textarea')!;
  await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
  await until(() => f.requests.length === 1 && !f.runtime.thread.getState().isRunning);
  expect(requestAdapter).toHaveBeenCalledOnce();
  expect(f.requests[0]!.messages[0]!.content).toBe('Question');
  expect(f.requests[0]!.context).toEqual([{ description: 'project', value: 'custom-context' }]);
  expect(f.requests[0]!.forwardedProps).toEqual({ ctx: { employees: [{ employeeId: 'one' }], action: [{ command: 'summarize' }] } });
  expect(commandData).toHaveBeenCalledWith({ id: 'summarize', label: 'Summary', mode: 'directive', data: { strategy: 'short' } });
  expect(f.host.textContent).toContain('@Person'); expect(f.host.textContent).toContain('/Summary');
});
it('does not carry a deleted selection or the previous turn into the next request', async () => {
  const requestAdapter = vi.fn<ComposerRequestAdapter>(({ request }) => request);
  const f = await mount({ search: async () => [{ id: 'one', type: 'user', label: 'Person' }] }, [], false, { mentionData: item => item.id, requestAdapter });
  await f.type('@Person'); await f.choose('Person');
  await f.type('Deleted the reference');
  await act(async () => f.runtime.thread.composer.send());
  await until(() => f.requests.length === 1 && !f.runtime.thread.getState().isRunning);
  expect(requestAdapter.mock.calls[0]![0].pluginData).toEqual({});
  expect(f.requests[0]!.forwardedProps).toEqual({});
  await f.type('Next'); await act(async () => f.runtime.thread.composer.send());
  await until(() => f.requests.length === 2 && !f.runtime.thread.getState().isRunning);
  expect(requestAdapter.mock.calls[1]![0].pluginData).toEqual({});
});
it('retains repeated structured selections in rich input and lets Composer send them as Context', async () => {
  const requestAdapter = vi.fn<ComposerRequestAdapter>(({ request, pluginData }) => ({
    ...request, context: [{ description: 'employees', value: JSON.stringify(pluginData['standalone:mention']) }], forwardedProps: {},
  }));
  const item = { id: 'one', type: 'user', label: 'Person', data: { role: 'owner' } };
  const f = await mount({ search: async () => [item] }, [], false, { lexical: true, mentionData: item => ({ id: item.id }), requestAdapter });
  await f.type('@Person'); await f.choose('Person');
  await f.type(`${f.runtime.thread.composer.getState().text}before @Person`); await f.choose('Person');
  await act(async () => f.runtime.thread.composer.send());
  await until(() => f.requests.length === 1 && !f.runtime.thread.getState().isRunning);
  expect(requestAdapter.mock.calls[0]![0].selections['standalone:mention']).toEqual([item, item]);
  expect(f.requests[0]!.messages[0]!.content).toBe('before');
  expect(JSON.parse(f.requests[0]!.context[0]!.value)).toEqual([{ id: 'one' }, { id: 'one' }]);
});
it('allows Composer to clear every default field', async () => {
  const f = await mount({ search: async () => [{ id: 'one', type: 'user', label: 'Person' }] }, [
    { id: 'summary', label: 'Summary', mode: 'directive' },
  ], false, {
    mentionData: item => ({ ctx: item.id }), commandData: item => ({ ctx: item.id }),
    requestAdapter: ({ request }) => ({ ...request, forwardedProps: {} }),
  });
  await f.type('@Person'); await f.choose('Person');
  await f.type(`${f.runtime.thread.composer.getState().text}/sum`); await f.choose('Summary');
  await act(async () => f.runtime.thread.composer.send());
  await until(() => f.requests.length === 1 && !f.runtime.thread.getState().isRunning);
  expect(f.requests[0]!.forwardedProps).toEqual({});
});
it('reports Plugin requestAdapter failures locally and keeps the draft without fallback insertion', async () => {
  const f = await mount({ search: async () => [{ id: 'one', type: 'user', label: 'Person' }] }, [], false,
    { mentionData: () => { throw new Error('Invalid project data'); } });
  await f.type('@Person'); await f.choose('Person');
  expect(f.runtime.thread.composer.getState().text).toBe('@Person');
  expect(f.host.textContent).toContain('Invalid item');
  expect(f.requests).toHaveLength(0);
});
it('exposes raw default selections to Composer without requiring a Plugin requestAdapter', async () => {
  const item = { id: 'one', type: 'user', label: 'Person', data: { role: 'owner' } };
  const f = await mount({ search: async () => [item] }, [], false, {
    requestAdapter: ({ request, selections }) => ({ ...request, forwardedProps: { raw: selections } }),
  });
  await f.type('@Person'); await f.choose('Person');
  expect(f.runtime.thread.composer.getState().text.trim()).toBe(':user[Person]{name=one}');
  await act(async () => f.runtime.thread.composer.send());
  await until(() => f.requests.length === 1 && !f.runtime.thread.getState().isRunning);
  expect(String(f.requests[0]!.messages[0]!.content).trim()).toBe(':user[Person]{name=one}');
  expect(f.requests[0]!.forwardedProps).toEqual({ raw: { 'standalone:mention': [item] } });
});
it('supports custom text and JSON data together, and removes a disabled Plugin contribution', async () => {
  const f = await mount({ search: async () => [{ id: 'one', type: 'user', label: 'Person' }] }, [], false, {
    mentionSelect: item => JSON.stringify({ employees: [item.id] }), mentionData: item => ({ employeeId: item.id }),
  });
  await f.type('@Person'); await f.choose('Person');
  await act(async () => f.runtime.thread.composer.send());
  await until(() => f.requests.length === 1 && !f.runtime.thread.getState().isRunning);
  expect(String(f.requests[0]!.messages[0]!.content).trim()).toBe('{"employees":["one"]}');
  expect(f.requests[0]!.forwardedProps).toEqual({ 'standalone:mention': [{ employeeId: 'one' }] });
  await f.type('@Person'); await f.choose('Person');
  await f.remove('mention');
  await act(async () => f.runtime.thread.composer.send());
  await until(() => f.requests.length === 2 && !f.runtime.thread.getState().isRunning);
  expect(f.requests[1]!.forwardedProps).toEqual({});
});
it("updates the open command menu when the packaged registry registers and removes commands", async () => {
  const execute = vi.fn();
  const { host, runtime, requests, type, choose, commandSource } = await mount(undefined, [
    { id: "keep", label: "Keep command", mode: "directive" },
  ]);
  await type("/");
  await until(() => host.textContent!.includes("Keep command"));
  let unregister = () => {};
  await act(async () => {
    unregister = commandSource.register({ id: "custom", label: "Custom action", mode: "action", execute });
  });
  await choose("Custom action");
  expect(execute).toHaveBeenCalledOnce();
  expect(requests).toHaveLength(0);
  await type("/");
  await until(() => host.textContent!.includes("Custom action"));
  await act(async () => unregister());
  await until(() => !host.textContent!.includes("Custom action"));
  await choose("Keep command");
  expect(runtime.thread.composer.getState().text).toContain(":command[Keep command]{name=keep}");
});
if (ConversationComposerMentionTrigger === ProjectMention) {
  it("uses the preconfigured project search without manually passing a source", async () => {
    const search = vi.spyOn(projectMentionSource, "search").mockResolvedValue([
      { id: "employee_project", type: "user", label: "Project person" },
    ]);
    const { runtime, type, choose } = await mount();
    await type("@Project");
    await choose("Project person");
    expect(search).toHaveBeenCalledWith({ query: "Project", signal: expect.objectContaining({ aborted: false }) });
    expect(runtime.thread.composer.getState().text).toContain("employee_project");
  });

  it("starts with an empty result when the project request has not been configured", async () => {
    const search = vi.spyOn(projectMentionSource, "search");
    const { host, type } = await mount();
    await type("@Nobody");
    await until(() => search.mock.calls.length > 0 && host.textContent!.includes("No matches"));
    expect(host.querySelectorAll('[role="option"]')).toHaveLength(0);
  });
}
it("searches Mention asynchronously, sends the stable ID through HttpAgent and retains historical chips after removal", async () => {
  const search = vi.fn(async () => [{ id: "employee_84721", type: "user", label: "Zhang San", description: 'Display only', data: { business: 'not automatically sent' } }]);
  const { host, runtime, requests, type, choose, remove } = await mount({ search });
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

it.each([
  { name: "without a cache key", identity: {} },
  { name: "with the same cache key", identity: { cacheKey: "same" } },
])("invalidates Mention results when a different source is provided $name", async ({ identity }) => {
  const first = { ...identity, search: async () => [{ id: "old", type: "user", label: "Old person" }] };
  const { host, type, replaceSource } = await mount(first);
  await type("@person"); await until(() => host.textContent!.includes("Old person"));
  await replaceSource({ ...identity, search: async () => [{ id: "new", type: "user", label: "New person" }] });
  await until(() => host.textContent!.includes("New person"));
  expect(host.textContent).not.toContain("Old person");
});
it("reports a failed Mention source and retries without changing the draft", async () => {
  const search = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue([{ id: "one", type: "user", label: "Person" }]);
  const { host, type, runtime } = await mount({ search });
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
it("leaves unsupported historical directive text intact when no explicit Mention source is passed", async () => {
  const { host, type, runtime, requests } = await mount();
  await type("@person");
  if (ConversationComposerMentionTrigger === ProjectMention) {
    await until(() => host.textContent!.includes("No matches"));
  } else {
    expect(host.querySelector('[role="listbox"]')).toBeNull();
  }
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

});
