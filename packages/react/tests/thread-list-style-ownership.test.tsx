// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AssistantRuntimeProvider, ThreadListPrimitive, useLocalRuntime, useRemoteThreadListRuntime, type RemoteThreadListAdapter } from "@assistant-ui/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConversationThreadListItemComposition } from "../src/internal/conversation-thread-list-item";
import { AgentUIRoot } from "../src/internal/style-boundary/AgentUIRoot";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const rename = vi.fn(async () => {});
const unused = async () => { throw new Error("Unexpected adapter action"); };
const adapter: RemoteThreadListAdapter = {
  list: async () => ({ threads: [{ remoteId: "history", status: "regular", title: "History" }] }),
  fetch: async remoteId => ({ remoteId, status: "regular", title: "History" }),
  rename, initialize: unused, archive: unused, unarchive: unused, delete: unused, generateTitle: unused,
};
function runtimeHook() { return useLocalRuntime({ async *run() {} }); }
function Host() {
  const runtime = useRemoteThreadListRuntime({ runtimeHook, adapter });
  return <AssistantRuntimeProvider runtime={runtime}><AgentUIRoot theme="violet">
    <ThreadListPrimitive.Root><ThreadListPrimitive.Items components={{ ThreadListItem: ConversationThreadListItemComposition }} /></ThreadListPrimitive.Root>
  </AgentUIRoot></AssistantRuntimeProvider>;
}
let root: Root | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); rename.mockClear(); });
async function settle(predicate: () => boolean) {
  for (let i = 0; i < 100 && !predicate(); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(predicate()).toBe(true);
}
async function mount() {
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(<Host />));
  await settle(() => container.querySelector('[data-slot="aui_thread-list-item-trigger"]') !== null);
  return container;
}
it("forwards ownership to real upstream Root and Trigger DOM nodes without owning business descendants", async () => {
  const container = await mount();
  const css = readFileSync(new URL("../src/preflight.scoped.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//gu, "");
  const selector = css.slice(0, css.indexOf("{"));
  for (const slot of ["aui_thread-list-item", "aui_thread-list-item-trigger"]) {
    const element = container.querySelector(`[data-slot="${slot}"]`)!;
    expect(element.getAttribute("data-agent-ui-owned")).toBe("");
    expect(element.matches(selector)).toBe(true);
    // These utility-only components do not otherwise opt into the baseline.
    element.removeAttribute("data-agent-ui-owned");
    expect(element.matches(selector)).toBe(false);
    element.setAttribute("data-agent-ui-owned", "");
    const business = document.createElement("button"); business.dataset.slot = "button"; element.append(business);
    expect(business.matches(selector)).toBe(false); business.remove();
  }
  expect(container.querySelector('[data-slot="aui_thread-list-item-trigger"]')?.tagName).toBe("BUTTON");
});
it("preserves upstream selection, keyboard menu opening, rename and focus restoration", async () => {
  const container = await mount();
  const trigger = container.querySelector<HTMLButtonElement>('[data-slot="aui_thread-list-item-trigger"]')!;
  await act(async () => trigger.click());
  await settle(() => container.querySelector('[data-slot="aui_thread-list-item"][data-active]') !== null);
  const more = container.querySelector<HTMLButtonElement>('[data-slot="agent-ui-thread-action-more"]')!;
  await act(async () => { more.focus(); more.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); });
  await settle(() => container.querySelector('[data-slot="agent-ui-thread-action-rename"]') !== null);
  expect(container.querySelector('[data-slot="agent-ui-thread-action-menu"]')?.closest("[data-agent-ui-portal-root]")).not.toBeNull();
  await act(async () => container.querySelector<HTMLElement>('[data-slot="agent-ui-thread-action-rename"]')!.click());
  await settle(() => container.querySelector('[data-slot="agent-ui-thread-rename-input"]') !== null);
  const input = container.querySelector<HTMLInputElement>('[data-slot="agent-ui-thread-rename-input"]')!;
  expect(document.activeElement).toBe(input);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Renamed history");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  await settle(() => rename.mock.calls.length === 1 && container.querySelector('[data-slot="aui_thread-list-item-trigger"]') !== null);
  expect(rename).toHaveBeenCalledWith("history", "Renamed history");
  expect(document.activeElement).toBe(container.querySelector('[data-slot="aui_thread-list-item-trigger"]'));
});
