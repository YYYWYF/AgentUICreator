import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useAui, type AssistantRuntime } from "@assistant-ui/react";
import { AgentUIRoot, AgentUILocaleProvider } from "@za38.03/agent-ui-plugins";
import { ConversationRuntimeProvider } from "@za38.03/agent-ui-runtime";
import { ConversationThreadListPlugin } from "../dist/conversation-thread-list/index.js";
import { createHttpConversationDataSource } from "../resources/registry/items/foundation/core-application/files/services/conversations/http-data-source";
import { createConversationService } from "../resources/registry/items/foundation/core-application/files/services/conversations/service";
import { createConversationServiceThreadBinding } from "../resources/registry/items/foundation/core-adapters/files/agent-ui/conversation/threads/conversation-service-thread-binding";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let dispose: (() => void) | undefined;
afterEach(async () => { await act(async () => root?.unmount()); dispose?.(); root = undefined; dispose = undefined; document.body.replaceChildren(); vi.unstubAllGlobals(); });
async function until(predicate: () => boolean) {
  for (let i = 0; i < 100 && !predicate(); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  expect(predicate()).toBe(true);
}

async function fixture(locale: "en-US" | "zh-CN" = "en-US") {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value() {} });
  const records = [
    { id: "current", title: "Current", status: "regular" as "regular" | "archived" },
    { id: "other", title: "Other", status: "regular" as "regular" | "archived" },
    { id: "saved", title: "Saved", status: "archived" as "regular" | "archived" },
  ];
  let fail = false;
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = String(input);
    if (init?.method === "GET" && url === "/history/conversations") return Response.json({ conversations: records });
    if (init?.method === "GET") {
      const id = url.split("/").at(-1)!;
      return Response.json({ id, title: records.find(item => item.id === id)?.title ?? id, state: { values: { messages: [] } } });
    }
    if (fail) return new Response(null, { status: 403 });
    const id = url.split("/")[3];
    const item = records.find(item => item.id === id)!;
    if (init?.method === "PATCH") item.title = JSON.parse(String(init.body)).title;
    else item.status = url.endsWith("/unarchive") ? "regular" : "archived";
    return new Response(null, { status: 204 });
  });
  const service = createConversationService({ dataSource: createHttpConversationDataSource({ endpoint: "/history", fetch }) });
  const binding = createConversationServiceThreadBinding(undefined, "current");
  const detach = binding.attachConversationService(service);
  dispose = () => { detach(); service.dispose(); };
  await service.refresh();
  let runtime!: AssistantRuntime;
  function Capture() { runtime = useAui().threads.__internal_getAssistantRuntime!(); return null; }
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const errors: Error[] = [];
  await act(async () => root!.render(<ConversationRuntimeProvider endpoint="http://example.test/agent" threadBinding={binding} onError={error => errors.push(error)}>
    <AgentUIRoot theme="light"><AgentUILocaleProvider locale={locale}><Capture /><ConversationThreadListPlugin /></AgentUILocaleProvider></AgentUIRoot>
  </ConversationRuntimeProvider>));
  await until(() => !!runtime && !runtime.thread.getState().isLoading && host.textContent!.includes("Other"));
  return { host, service, fetch, errors, records, get runtime() { return runtime; }, setFail(value: boolean) { fail = value; } };
}

it.each(["en-US", "zh-CN"] as const)("%s exposes all actions and restores an archived thread through the project HTTP service", async locale => {
  const f = await fixture(locale);
  const archiveSection = f.host.querySelector<HTMLDetailsElement>('[data-slot="agent-ui-archived-threads"]')!;
  expect(archiveSection.textContent).toContain(locale === "zh-CN" ? "已归档会话" : "Archived conversations");
  expect(archiveSection.textContent).toContain("Saved");
  await act(async () => { await f.runtime.threads.getItemById("other").rename("Renamed"); });
  expect(f.records.find(item => item.id === "other")?.title).toBe("Renamed");
  await act(async () => { await f.runtime.threads.getItemById("other").archive(); });
  await until(() => f.host.querySelector('[data-slot="agent-ui-archived-threads"]')!.textContent!.includes("Renamed"));
  await act(async () => { await f.runtime.threads.getItemById("other").unarchive(); });
  await act(async () => { await f.service.refresh(); });
  await until(() => f.runtime.threads.getItemById("other").getState().status === "regular");
  expect(f.runtime.threads.getItemById("other").getState().title).toBe("Renamed");
  expect(f.host.querySelector('[data-slot="agent-ui-archived-threads"]')!.textContent).not.toContain("Renamed");
  expect(f.fetch.mock.calls.filter(([, init]) => init?.method !== "GET").map(([url, init]) => [url, init?.method])).toEqual([
    ["/history/conversations/other", "PATCH"], ["/history/conversations/other/archive", "POST"], ["/history/conversations/other/unarchive", "POST"],
  ]);
  const row = [...f.host.querySelectorAll<HTMLElement>('[data-slot="aui_thread-list-item"]')].find(item => item.textContent?.includes("Renamed"))!;
  const more = row.querySelector<HTMLButtonElement>('[data-slot="agent-ui-thread-action-more"]')!;
  await act(async () => { more.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 })); more.click(); });
  await until(() => !!document.querySelector('[data-slot="agent-ui-thread-action-rename"]'));
  expect(document.querySelector('[data-slot="agent-ui-thread-action-archive"]')).not.toBeNull();
  expect(document.querySelector('[data-slot="agent-ui-thread-action-delete"]')).not.toBeNull();
});

it("rolls back assistant-ui optimistic state when the configured backend rejects an operation", async () => {
  const f = await fixture();
  f.setFail(true);
  await act(async () => { await expect(f.runtime.threads.getItemById("other").rename("Rejected")).rejects.toThrow("403"); });
  expect(f.runtime.threads.getItemById("other").getState().title).toBe("Other");
  await act(async () => { await expect(f.runtime.threads.getItemById("other").archive()).rejects.toThrow("403"); });
  expect(f.runtime.threads.getItemById("other").getState().status).toBe("regular");
  await act(async () => { await expect(f.runtime.threads.getItemById("saved").unarchive()).rejects.toThrow("403"); });
  expect(f.runtime.threads.getItemById("saved").getState().status).toBe("archived");
});
