// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useAui, type AssistantRuntime } from "@assistant-ui/react";
import { AgentUIRoot, AgentUILocaleProvider } from "@za38.03/agent-ui-plugins";
import { ConversationRuntimeProvider } from "@za38.03/agent-ui-runtime";
import { CanonicalConversationThreadList } from "../src/plugins/conversation-thread-list/adapters/presentation/conversation-thread-list.js";
import { createConversationService } from "../src/plugins/conversation-service/adapters/presentation/service.js";
import { createEmptyConversationDataSource } from "../src/plugins/conversation-service/adapters/presentation/data-source.js";
import { createConversationServiceThreadBinding } from "../src/plugins/conversation-service/adapters/presentation/thread-binding.js";
import type { ConversationSummary } from "../src/plugins/conversation-service/adapters/presentation/contract.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let dispose: (() => void) | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  dispose?.();
  root = undefined;
  dispose = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

async function until(predicate: () => boolean) {
  for (let index = 0; index < 100 && !predicate(); index++) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  }
  expect(predicate()).toBe(true);
}

async function fixture(records: ConversationSummary[], locale: "en-US" | "zh-CN" = "en-US") {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  const service = createConversationService({
    dataSource: {
      ...createEmptyConversationDataSource(),
      list: async () => records,
      get: async id => ({ id, title: records.find(item => item.id === id)!.title, history: { format: "langchain", messages: [] } }),
    },
  });
  const binding = createConversationServiceThreadBinding(undefined, records[0]!.id);
  const detach = binding.attachConversationService(service);
  dispose = () => { detach(); service.dispose(); };
  await service.refresh();
  let runtime: AssistantRuntime | undefined;
  function Capture() {
    runtime = useAui().threads.__internal_getAssistantRuntime?.();
    return null;
  }
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(
    <ConversationRuntimeProvider endpoint="http://example.test/agent" threadBinding={binding}>
      <AgentUIRoot theme="light"><AgentUILocaleProvider locale={locale}>
        <Capture /><CanonicalConversationThreadList />
      </AgentUILocaleProvider></AgentUIRoot>
    </ConversationRuntimeProvider>,
  ));
  await until(() => !!runtime && host.textContent!.includes(records[0]!.title));
  return {
    host, service, binding,
    get runtime() {
      if (!runtime) throw new Error("Missing test runtime");
      return runtime;
    },
    labels: () => [...host.querySelectorAll('[data-slot="aui_thread-list-group-label"]')].map(node => node.textContent),
  };
}

// Calendar arithmetic covers local-day boundaries, including DST; timestamps
// cross the service/Runtime boundary as ISO instants, independent of OS locale.
function daysAgo(days: number) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, 12).toISOString();
}

it.each(["en-US", "zh-CN"] as const)("%s groups persisted conversations by local day and moves them after refresh", async locale => {
  const records: ConversationSummary[] = [
    { id: "older", title: "Older conversation", updatedAt: daysAgo(3) },
    { id: "yesterday", title: "Yesterday conversation", updatedAt: daysAgo(1) },
    { id: "today", title: "Today conversation", updatedAt: daysAgo(0) },
  ];
  const f = await fixture(records, locale);
  const labels = locale === "zh-CN" ? ["今天", "昨天", "更早"] : ["Today", "Yesterday", "Earlier"];
  expect(f.labels()).toEqual(labels);
  const list = f.host.querySelector('[data-slot="aui_thread-list-items"]')!;
  expect([...list.children].map(node => node.querySelector('[data-slot="aui_thread-list-item-trigger"]')?.textContent ?? node.textContent)).toEqual([
    labels[0], "Today conversation", labels[1], "Yesterday conversation", labels[2], "Older conversation",
  ]);
  expect(f.runtime.threads.getItemById("yesterday").getState().lastMessageAt).toEqual(new Date(daysAgo(1)));

  records[1] = { ...records[1]!, updatedAt: daysAgo(0) };
  await act(async () => { await f.service.refresh(); });
  await until(() => f.labels().length === 2);
  expect(f.labels()).toEqual([labels[0], labels[2]]);
  expect(f.runtime.threads.getItemById("yesterday").getState().lastMessageAt).toEqual(new Date(daysAgo(0)));
});

it("keeps missing or invalid timestamps ungrouped and preserves valid archived timestamps", async () => {
  const f = await fixture([
    { id: "missing", title: "Missing timestamp" },
    { id: "invalid", title: "Invalid timestamp", updatedAt: "not-a-date" },
    { id: "archived", title: "Archived conversation", status: "archived", updatedAt: "2026-11-15T00:30:00+08:00" },
  ]);
  expect(f.labels()).toEqual([]);
  expect(f.runtime.threads.getItemById("missing").getState().lastMessageAt).toBeUndefined();
  expect(f.runtime.threads.getItemById("invalid").getState().lastMessageAt).toBeUndefined();
  expect(f.runtime.threads.getItemById("archived").getState().lastMessageAt?.toISOString()).toBe("2026-11-14T16:30:00.000Z");
  const snapshot = f.binding.getThreadListSnapshot();
  await act(async () => { await f.service.refresh(); });
  expect(f.binding.getThreadListSnapshot()).toEqual(snapshot);
});
