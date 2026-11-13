// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { afterEach, expect, it, vi } from "vitest";
import * as Plugins from "@za38.03/agent-ui-plugins";
import { PluginServiceRuntimeProvider } from "../src/plugin-api/PluginServiceContext";
import * as Conversations from "@za38.03/agent-ui-plugins/conversation-service";
import { ConversationRuntimeProvider } from "@za38.03/agent-ui-runtime";
import { createConversationServiceThreadBinding } from "@za38.03/agent-ui-plugins/conversation-service";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

type ConversationState = { snapshot: Conversations.ConversationSnapshot; serviceAvailable: boolean };
type ConversationActionView = Plugins.ConversationActions & {
  serviceAvailable: boolean;
  refresh(): Promise<void> | undefined;
  loadConversation(id: string): Promise<Conversations.ConversationDetail>;
};
type ConversationView = ConversationState & ConversationActionView;

// Load the project template with its real hooks and contract, without requiring
// a physical services directory next to the canonical template owner.
async function loadHooks() {
  const modules: Record<string, unknown> = {
    react: React, "@za38.03/agent-ui-plugins": Plugins,
    "../conversations": Conversations,
  };
  const exports: Record<string, unknown> = {};
  for (const hook of ["useConversations", "useConversationActions"]) {
    const hookPath = `../src/shared/project/services/hooks/${hook}.ts`;
    const source = await readFile(new URL(hookPath, import.meta.url), "utf8");
    const code = execFileSync(process.execPath, ["-e",
      'const {transformSync}=require(process.argv[1]);process.stdout.write(transformSync(require("node:fs").readFileSync(0,"utf8"),{loader:"ts",format:"cjs"}).code);',
      createRequire(import.meta.url).resolve("esbuild"),
    ], { input: source, encoding: "utf8" });
    const output = { exports: {} };
    new Function("require", "module", "exports", code)((name: string) => {
      if (!(name in modules)) throw new Error(`Unexpected hook dependency: ${name}`);
      return modules[name];
    }, output, output.exports);
    Object.assign(exports, output.exports);
  }
  return exports as { useConversations(): ConversationState; useConversationActions(): ConversationActionView };
}

it("observes the shared service, follows replacement/removal and releases subscriptions without disposing it", async () => {
  const { useConversations } = await loadHooks();
  function observable(title: string) {
    let snapshot = { ...Conversations.EMPTY_CONVERSATION_SNAPSHOT, conversations: [{ id: title, title }] };
    const listeners = new Set<() => void>();
    const refresh = vi.fn(async () => {});
    const dispose = vi.fn();
    const service = {
      getSnapshot: () => snapshot,
      subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
      refresh, dispose,
    };
    return { service, listeners, update(title: string) {
      snapshot = { ...snapshot, conversations: [{ id: title, title }] };
      listeners.forEach(listener => listener());
    } };
  }
  const first = observable("first"), second = observable("second");
  let service: typeof first.service | undefined;
  let revision = 0;
  const registryListeners = new Set<() => void>();
  const runtime = {
    get: <T,>(name: string) => { expect(name).toBe("agent-ui.conversations"); return service as T | undefined; },
    subscribe(listener: () => void) { registryListeners.add(listener); return () => { registryListeners.delete(listener); }; },
    getRevision: () => revision,
  };
  const views: ConversationState[] = [];
  function Consumer({ index }: { index: number }) {
    views[index] = useConversations();
    return <span>{views[index]!.snapshot.conversations[0]?.title}</span>;
  }
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(<PluginServiceRuntimeProvider runtime={runtime}><Consumer index={0} /><Consumer index={1} /></PluginServiceRuntimeProvider>));
  expect(views[0]!.serviceAvailable).toBe(false);
  expect(views[0]!.snapshot).toBe(Conversations.EMPTY_CONVERSATION_SNAPSHOT);
  async function replace(next: typeof service) {
    await act(async () => { service = next; revision++; registryListeners.forEach(listener => listener()); });
  }
  await replace(first.service);
  expect(first.listeners.size).toBe(2);
  expect(views[0]!.snapshot).toBe(views[1]!.snapshot);
  await act(async () => first.update("updated"));
  expect(host.textContent).toBe("updatedupdated");
  await replace(second.service);
  expect(first.listeners.size).toBe(0);
  expect(second.listeners.size).toBe(2);
  await replace(undefined);
  expect(second.listeners.size).toBe(0);
  expect(views[0]!.serviceAvailable).toBe(false);
  await replace(second.service);
  await act(async () => root!.unmount()); root = undefined;
  expect(second.listeners.size).toBe(0);
  expect(registryListeners.size).toBe(0);
  expect(first.service.refresh).not.toHaveBeenCalled();
  expect(second.service.refresh).not.toHaveBeenCalled();
  expect(first.service.dispose).not.toHaveBeenCalled();
  expect(second.service.dispose).not.toHaveBeenCalled();
});

it("provides commands without subscribing to history snapshots and follows service availability", async () => {
  const { useConversationActions } = await loadHooks();
  const first = { refresh: vi.fn(async () => {}), getSnapshot: vi.fn(), subscribe: vi.fn() };
  const second = { refresh: vi.fn(async () => {}), getSnapshot: vi.fn(), subscribe: vi.fn() };
  let service: typeof first | undefined;
  let revision = 0;
  const listeners = new Set<() => void>();
  const runtime = {
    get: <T,>() => service as T | undefined,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getRevision: () => revision,
  };
  let actions!: ConversationActionView;
  function Consumer() { actions = useConversationActions(); return null; }
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(<ConversationRuntimeProvider endpoint="http://example.test/agent" threadBinding={createConversationServiceThreadBinding(undefined, "A")}><PluginServiceRuntimeProvider runtime={runtime}><Consumer /></PluginServiceRuntimeProvider></ConversationRuntimeProvider>));
  expect(actions.refresh()).toBeUndefined();
  for (const operation of [
    () => actions.deleteConversation("A"), () => actions.renameConversation("A", "renamed"),
    () => actions.archiveConversation("A"), () => actions.unarchiveConversation("A"),
    () => actions.selectConversation("A"), () => actions.loadConversation("A"),
  ]) await expect(operation()).rejects.toThrow("CONVERSATION_SERVICE_UNAVAILABLE");
  async function replace(next: typeof service) {
    await act(async () => { service = next; revision++; listeners.forEach(listener => listener()); });
  }
  await replace(first);
  expect(actions.serviceAvailable).toBe(true);
  await actions.refresh(); expect(first.refresh).toHaveBeenCalledOnce();
  await replace(second);
  await actions.refresh(); expect(second.refresh).toHaveBeenCalledOnce();
  for (const source of [first, second]) {
    expect(source.subscribe).not.toHaveBeenCalled();
    expect(source.getSnapshot).not.toHaveBeenCalled();
  }
  await replace(undefined); expect(actions.serviceAvailable).toBe(false);
  await act(async () => root!.unmount()); root = undefined;
  expect(listeners.size).toBe(0);
});

async function until(predicate: () => boolean) {
  for (let i = 0; i < 100 && !predicate(); i++) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  }
  expect(predicate()).toBe(true);
}

async function conversationFixture() {
  const { useConversations, useConversationActions } = await loadHooks();
  let records: Conversations.ConversationSummary[] = ["A", "B", "C"].map(id => ({ id, title: id, status: "regular" }));
  const source: Conversations.ConversationDataSource = {
    list: vi.fn(async () => records.map(item => ({ ...item }))),
    get: vi.fn(async id => ({ id, title: records.find(item => item.id === id)!.title, history: { format: "langchain" as const, messages: [] }, agentState: { owner: id } })),
    delete: vi.fn(async id => { records = records.filter(item => item.id !== id); }),
    rename: vi.fn(async (id, title) => { records = records.map(item => item.id === id ? { ...item, title } : item); }),
    archive: vi.fn(async id => { records = records.map(item => item.id === id ? { ...item, status: "archived" } : item); }),
    unarchive: vi.fn(async id => { records = records.map(item => item.id === id ? { ...item, status: "regular" } : item); }),
  };
  const service = Conversations.createConversationService({ dataSource: source });
  await service.refresh();
  const binding = createConversationServiceThreadBinding(undefined, "A");
  const detach = binding.attachConversationService(service);
  const runtime = { get: <T,>() => service as T, subscribe: () => () => {}, getRevision: () => 0 };
  let view!: ConversationView;
  function Consumer() { view = { ...useConversations(), ...useConversationActions() }; return null; }
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(
    <ConversationRuntimeProvider endpoint="http://example.test/agent" threadBinding={binding}>
      <PluginServiceRuntimeProvider runtime={runtime}><Consumer /></PluginServiceRuntimeProvider>
    </ConversationRuntimeProvider>,
  ));
  await until(() => view?.serviceAvailable === true);
  return { source, service, binding, get view() { return view; }, async dispose() {
    await act(async () => root!.unmount()); root = undefined;
    detach(); service.dispose();
  } };
}

it("selects, renames, archives, restores and deletes through the canonical Runtime, with independent detail reads", async () => {
  const f = await conversationFixture();
  try {
    let detail!: Conversations.ConversationDetail;
    await act(async () => { detail = await f.view.loadConversation("C"); });
    expect(detail.agentState).toEqual({ owner: "C" });
    expect(f.binding.getThreadId()).toBe("A");
    await act(async () => { await f.view.selectConversation("B"); });
    await until(() => f.binding.getThreadId() === "B");
    expect(f.view.snapshot.activeConversationId).toBe("B");
    await act(async () => { await f.view.renameConversation("B", "Renamed B"); });
    expect(f.source.rename).toHaveBeenCalledWith("B", "Renamed B");
    expect(f.view.snapshot.conversations.find(item => item.id === "B")?.title).toBe("Renamed B");
    await act(async () => { await f.view.archiveConversation("B"); });
    expect(f.binding.getThreadId()).not.toBe("B");
    expect(f.view.snapshot.conversations.find(item => item.id === "B")?.status).toBe("archived");
    await act(async () => { await f.view.unarchiveConversation("B"); });
    expect(f.view.snapshot.conversations.find(item => item.id === "B")?.status).toBe("regular");
    await act(async () => { await f.view.selectConversation("B"); });
    await until(() => f.binding.getThreadId() === "B");
    await act(async () => { await f.view.deleteConversation("B"); });
    expect(f.source.delete).toHaveBeenCalledWith("B");
    expect(f.view.snapshot.conversations.some(item => item.id === "B")).toBe(false);
    expect(f.binding.getThreadId()).not.toBe("B");
  } finally { await f.dispose(); }
});

it("waits for persistence and propagates failures without reporting an unsuccessful deletion as complete", async () => {
  const f = await conversationFixture();
  try {
    let reject!: (error: Error) => void;
    vi.mocked(f.source.delete).mockImplementationOnce(() => new Promise<void>((_resolve, rejectPromise) => { reject = rejectPromise; }));
    let settled = false;
    let operation!: Promise<void>;
    await act(async () => {
      operation = f.view.deleteConversation("B");
      void operation.then(() => { settled = true; }, () => { settled = true; });
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    await until(() => reject !== undefined);
    expect(settled).toBe(false);
    const failure = new Error("backend unavailable");
    await act(async () => { reject(failure); await expect(operation).rejects.toBe(failure); });
    expect(f.view.snapshot.conversations.some(item => item.id === "B")).toBe(true);
    expect(f.binding.getThreadId()).toBe("A");
    delete f.source.archive;
    await act(async () => {
      await expect(f.view.archiveConversation("B")).rejects.toThrow("CONVERSATION_OPERATION_NOT_CONFIGURED");
    });
    expect(f.view.snapshot.conversations.find(item => item.id === "B")?.status).toBe("regular");
    const loadFailure = new Error("history unavailable");
    vi.mocked(f.source.get).mockRejectedValueOnce(loadFailure);
    await act(async () => { await f.view.selectConversation("C"); });
    await until(() => f.view.snapshot.activeConversationId === "C" && f.view.snapshot.detailStatus === "error");
    expect(f.view.snapshot.detailError).toBe("history unavailable");
  } finally { await f.dispose(); }
});
