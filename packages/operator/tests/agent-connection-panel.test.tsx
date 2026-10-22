// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentConnectionPanel, CONNECTION_CHANGED } from "../src/ui/AgentConnectionPanel.js";
import { CreatorLocaleProvider } from "../src/ui/i18n/locale.js";
import type { AgentConnectionState } from "../src/agent-connection/types.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined; document.body.replaceChildren(); vi.unstubAllGlobals();
});
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}
async function renderPanel() {
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(<CreatorLocaleProvider locale="zh-CN"><AgentConnectionPanel workspaceId="workspace" visible /></CreatorLocaleProvider>));
  return container;
}
async function selectMode(container: HTMLElement, mode: string) {
  await act(async () => {
    const select = container.querySelector("select")!;
    select.value = mode; select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("connection mode autosave", () => {
  it.each(["mock", "connected"] as const)("persists mode immediately while retaining %s and the endpoint draft", async activeSource => {
    const saved: AgentConnectionState = { activeSource, endpoint: "http://localhost:8000/agent", connectionMode: "proxy", configured: true, running: false };
    const fetch = vi.fn(async (_url: unknown, options: RequestInit) => {
      if (options.method === "POST") Object.assign(saved, JSON.parse(options.body as string));
      return json(saved);
    });
    vi.stubGlobal("fetch", fetch);
    const container = await renderPanel();
    const input = container.querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "unfinished address");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const changed = vi.fn(); window.addEventListener(CONNECTION_CHANGED, changed);
    try {
      await selectMode(container, "direct");
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(JSON.parse(fetch.mock.calls[1]![1].body as string)).toEqual({ activeSource, connectionMode: "direct" });
      expect(saved).toMatchObject({ activeSource, endpoint: "http://localhost:8000/agent", connectionMode: "direct" });
      expect(input.value).toBe("unfinished address");
      expect(container.querySelector("select")!.value).toBe("direct");
      expect(changed).toHaveBeenCalledTimes(1);
      expect((changed.mock.calls[0]![0] as CustomEvent).detail.state.activeSource).toBe(activeSource);
      await selectMode(container, "proxy");
      expect(saved.connectionMode).toBe("proxy");
    } finally { window.removeEventListener(CONNECTION_CHANGED, changed); }
  });

  it("locks controls during saving and restores the saved mode after failure", async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn((_url: unknown, options: RequestInit) => options.method === "POST"
      ? new Promise<Response>(resolve => { finish = resolve; })
      : Promise.resolve(json({ activeSource: "mock", configured: true, running: false, connectionMode: "proxy" }))));
    const container = await renderPanel();
    const changed = vi.fn(); window.addEventListener(CONNECTION_CHANGED, changed);
    try {
      await selectMode(container, "direct");
      expect(container.querySelector("select")!.disabled).toBe(true);
      expect(Array.from(container.querySelectorAll("button")).every(button => button.disabled)).toBe(true);
      await act(async () => finish(json({ error: "Connection settings are being updated." }, 409)));
      expect(container.querySelector("select")!.value).toBe("proxy");
      expect(container.querySelector("select")!.disabled).toBe(false);
      expect(container.querySelector('[role="alert"]')!.textContent).toContain("连接设置未保存");
      expect(changed).not.toHaveBeenCalled();
    } finally { window.removeEventListener(CONNECTION_CHANGED, changed); }
  });
});
