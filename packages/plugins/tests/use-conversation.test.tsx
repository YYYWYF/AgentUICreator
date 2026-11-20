// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import {
  useConversation,
  type ConversationMessage,
  type ConversationState,
  type ConversationThreadController,
  type ConversationThreadSnapshot} from "../src/index.js";

const { useAuiMock } = vi.hoisted(() => ({ useAuiMock: vi.fn<() => unknown>() }));
vi.mock("@assistant-ui/react", async importOriginal => ({
  ...await importOriginal<typeof import("@assistant-ui/react")>(),
  useAui: useAuiMock,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.clearAllMocks();
});

function message(id: string): ConversationMessage {
  return { id, role: "assistant", content: [{ type: "text", text: id }] };
}

function store() {
  let thread: ConversationThreadSnapshot = { messages: [message("first")], isRunning: false };
  let threads: ConversationState["threads"] = {
    isLoading: false, threadIds: ["A"], archivedThreadIds: [], threadItems: [],
  };
  let item: ConversationState["threadListItem"] = { status: "regular", custom: { agentUiDisabled: false } };
  let currentMessage: ConversationState["message"] = { isCopied: false };
  const listeners = new Set<() => void>();
  const client = {
    thread: { getState: vi.fn(() => thread) },
    threads: { getState: vi.fn(() => threads) },
    threadListItem: { getState: vi.fn(() => item) },
    message: { getState: vi.fn(() => currentMessage) },
    subscribe: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    }),
  };
  const notify = () => listeners.forEach(listener => listener());
  return {
    client, listeners, notify,
    setThread(next: Partial<ConversationThreadSnapshot>) { thread = { ...thread, ...next }; notify(); },
    setLoading(isLoading: boolean) { threads = { ...threads, isLoading }; notify(); },
    setDisabled(disabled: boolean) { item = { ...item, custom: { agentUiDisabled: disabled } }; notify(); },
    setCopied(isCopied: boolean) { currentMessage = { isCopied }; notify(); },
  };
}

function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  return host;
}

it("reads the latest snapshot without subscribing or eagerly reading any scope", async () => {
  const source = store();
  useAuiMock.mockReturnValue(source.client);
  let conversation!: ConversationThreadController;
  let renders = 0;
  function Consumer() { conversation = useConversation(); renders++; return null; }
  mount();
  await act(async () => root!.render(<Consumer />));
  const initial = conversation;
  expect(source.client.subscribe).not.toHaveBeenCalled();
  for (const scope of [source.client.thread, source.client.threads, source.client.message, source.client.threadListItem]) {
    expect(scope.getState).not.toHaveBeenCalled();
  }
  const first = conversation.getSnapshot();
  expect(conversation.getSnapshot()).toBe(first);
  await act(async () => source.setThread({ messages: [message("first"), message("second")], state: { orderId: "O-1" }, isRunning: true }));
  expect(renders).toBe(1);
  expect(conversation).toBe(initial);
  const latest = conversation.getSnapshot();
  expect(latest).toMatchObject({ state: { orderId: "O-1" }, isRunning: true });
  expect(latest.messages.flatMap(value => value.content)).toEqual([
    { type: "text", text: "first" }, { type: "text", text: "second" },
  ]);
  expect(source.listeners.size).toBe(0);
});

it("only renders consumers whose selected value changed", async () => {
  const source = store();
  useAuiMock.mockReturnValue(source.client);
  const renders = { loading: 0, messages: 0, running: 0, snapshot: 0 };
  function Loading() { const value = useConversation(state => state.threads.isLoading); renders.loading++; return <span>{String(value)}</span>; }
  function Messages() { const value = useConversation(state => state.thread.messages); renders.messages++; return <span>{value.length}</span>; }
  function Running() { const value = useConversation(state => state.thread.isRunning); renders.running++; return <span>{String(value)}</span>; }
  function Snapshot() { useConversation(state => state.thread); renders.snapshot++; return null; }
  mount();
  await act(async () => root!.render(<><Loading /><Messages /><Running /><Snapshot /></>));
  expect(renders).toEqual({ loading: 1, messages: 1, running: 1, snapshot: 1 });
  await act(async () => source.setThread({ messages: [message("second")] }));
  expect(renders).toEqual({ loading: 1, messages: 2, running: 1, snapshot: 2 });
  await act(async () => source.setThread({ isRunning: true }));
  expect(renders).toEqual({ loading: 1, messages: 2, running: 2, snapshot: 3 });
  await act(async () => source.setLoading(true));
  expect(renders).toEqual({ loading: 2, messages: 2, running: 2, snapshot: 3 });
  await act(async () => { source.notify(); source.setThread({}); });
  expect(renders).toEqual({ loading: 2, messages: 2, running: 2, snapshot: 3 });
  expect(source.client.message.getState).not.toHaveBeenCalled();
  expect(source.client.threadListItem.getState).not.toHaveBeenCalled();
  await act(async () => root!.unmount());
  root = undefined;
  expect(source.listeners.size).toBe(0);
});

it("preserves scoped message and list-item selectors", async () => {
  const source = store();
  useAuiMock.mockReturnValue(source.client);
  function Consumer() {
    const copied = useConversation(state => state.message.isCopied);
    const disabled = useConversation(state => state.threadListItem.custom?.agentUiDisabled === true);
    return <span>{String(copied)}/{String(disabled)}</span>;
  }
  const host = mount();
  await act(async () => root!.render(<Consumer />));
  expect(host.textContent).toBe("false/false");
  await act(async () => { source.setCopied(true); source.setDisabled(true); });
  expect(host.textContent).toBe("true/true");
  expect(source.client.thread.getState).not.toHaveBeenCalled();
  expect(source.client.threads.getState).not.toHaveBeenCalled();
});

it("preserves Object.is equality when caching shared state in a Thread snapshot", async () => {
  const source = store();
  useAuiMock.mockReturnValue(source.client);
  let snapshot!: ConversationThreadSnapshot;
  let renders = 0;
  function Consumer() { snapshot = useConversation(state => state.thread); renders++; return null; }
  mount();
  await act(async () => root!.render(<Consumer />));
  await act(async () => source.setThread({ state: -0 }));
  expect(Object.is(snapshot.state, -0)).toBe(true);
  await act(async () => source.setThread({ state: 0 }));
  expect(Object.is(snapshot.state, 0)).toBe(true);
  await act(async () => source.setThread({ state: Number.NaN }));
  const before = renders;
  await act(async () => source.setThread({ state: Number.NaN }));
  expect(renders).toBe(before);
  expect(Object.is(snapshot.state, Number.NaN)).toBe(true);
});

it("supports changing selectors and switching between subscription and immediate reads", async () => {
  const source = store();
  useAuiMock.mockReturnValue(source.client);
  let selected: boolean | ConversationThreadController = false;
  function Consumer({ selector }: { selector: ((state: ConversationState) => boolean) | undefined }) {
    selected = useConversation(selector);
    return null;
  }
  mount();
  await act(async () => root!.render(<Consumer selector={undefined} />));
  expect(source.listeners.size).toBe(0);
  await act(async () => root!.render(<Consumer selector={state => state.threads.isLoading} />));
  expect(source.listeners.size).toBe(1);
  await act(async () => source.setLoading(true));
  expect(selected).toBe(true);
  await act(async () => root!.render(<Consumer selector={state => state.thread.isRunning} />));
  expect(selected).toBe(false);
  await act(async () => root!.render(<Consumer selector={undefined} />));
  expect(source.listeners.size).toBe(0);
  expect(typeof selected).toBe("object");
});

it("releases subscriptions on client replacement and reads the newly selected Thread", async () => {
  const first = store();
  const second = store();
  second.setThread({ messages: [message("B")] });
  let latest = "";
  let conversation!: ConversationThreadController;
  function Consumer() {
    conversation = useConversation();
    latest = useConversation(state => state.thread.messages[0]!.id);
    return null;
  }
  mount();
  useAuiMock.mockReturnValue(first.client);
  await act(async () => root!.render(<Consumer />));
  expect(latest).toBe("first");
  expect(first.listeners.size).toBe(1);
  useAuiMock.mockReturnValue(second.client);
  await act(async () => root!.render(<Consumer />));
  expect(first.listeners.size).toBe(0);
  expect(second.listeners.size).toBe(1);
  expect(latest).toBe("B");
  expect(conversation.getSnapshot().messages[0]!.id).toBe("B");
  // A stable canonical client can also switch its active Thread in place.
  await act(async () => second.setThread({ messages: [message("C")] }));
  expect(latest).toBe("C");
  expect(conversation.getSnapshot().messages[0]!.id).toBe("C");
});

it("provides explicit subscriptions with cleanup and fresh snapshots", async () => {
  const source = store();
  useAuiMock.mockReturnValue(source.client);
  let conversation!: ConversationThreadController;
  function Consumer() { conversation = useConversation(); return null; }
  mount();
  await act(async () => root!.render(<Consumer />));
  const snapshots: ConversationThreadSnapshot[] = [];
  const unsubscribe = conversation.subscribe(() => snapshots.push(conversation.getSnapshot()));
  expect(source.listeners.size).toBe(1);
  source.setThread({ isRunning: true });
  expect(snapshots.at(-1)?.isRunning).toBe(true);
  unsubscribe();
  source.setThread({ isRunning: false });
  expect(snapshots).toHaveLength(1);
  expect(source.listeners.size).toBe(0);
});
