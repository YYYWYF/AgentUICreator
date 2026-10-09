import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { ConversationThreadListSearch } from "../src/public.js";
import { AgentUILocaleProvider, type AgentUILocaleCode } from "../src/locale.js";

let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

async function mount(locale: AgentUILocaleCode = "zh-CN", preventEscape = false) {
  const container = document.createElement("div");
  document.body.append(container);
  function Host() {
    const [query, setQuery] = useState("新会话");
    return <AgentUILocaleProvider locale={locale}>
      <ConversationThreadListSearch value={query} onValueChange={setQuery}
        onKeyDown={event => { if (preventEscape) event.preventDefault(); }} />
    </AgentUILocaleProvider>;
  }
  root = createRoot(container);
  await act(async () => root!.render(<Host />));
  return container;
}

it("clears the controlled query, restores input focus and removes the clear button", async () => {
  const el = await mount();
  const input = el.querySelector<HTMLInputElement>('[role="searchbox"]')!;
  const clear = el.querySelector<HTMLButtonElement>('button[aria-label="清除搜索"]')!;
  expect(input.value).toBe("新会话");
  await act(async () => clear.click());
  expect(input.value).toBe("");
  expect(document.activeElement).toBe(input);
  expect(el.querySelector('button[aria-label="清除搜索"]')).toBeNull();
});

it("handles Escape without propagating it to a surrounding drawer", async () => {
  const el = await mount();
  let outerEvents = 0;
  const observeOuter = () => { outerEvents++; };
  document.body.addEventListener("keydown", observeOuter);
  const input = el.querySelector<HTMLInputElement>('[role="searchbox"]')!;
  await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  document.body.removeEventListener("keydown", observeOuter);
  expect(input.value).toBe("");
  expect(outerEvents).toBe(0);
});

it("respects a caller that prevents the Escape action", async () => {
  const el = await mount("zh-CN", true);
  const input = el.querySelector<HTMLInputElement>('[role="searchbox"]')!;
  await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  expect(input.value).toBe("新会话");
});

it("uses the unified English locale for the clear control", async () => {
  const el = await mount("en-US");
  expect(el.querySelector('button[aria-label="Clear search"]')).not.toBeNull();
  expect(el.querySelector('[role="searchbox"]')?.getAttribute("aria-label")).toBe("Search threads");
});
