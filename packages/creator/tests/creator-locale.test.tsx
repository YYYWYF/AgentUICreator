// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentConnectionPanel } from "../src/ui/AgentConnectionPanel.js";
import { CreatorLocaleProvider, CREATOR_LOCALES, resolveCreatorLocaleMessages, formatLocaleMessage, localizeCreatorPresentation } from "../src/ui/i18n/locale.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; document.body.replaceChildren(); vi.unstubAllGlobals(); });

describe("Creator presentation locale", () => {
  it("switches real connection controls without clearing the endpoint draft or sending an update", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ activeSource: "connected", configured: true, running: false, endpoint: "http://localhost:8000/agent" }), { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root!.render(<CreatorLocaleProvider locale="zh-CN"><AgentConnectionPanel workspaceId="workspace" visible /></CreatorLocaleProvider>));
    const input = container.querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "http://localhost:9000/draft");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => root!.render(<CreatorLocaleProvider locale="en-US"><AgentConnectionPanel workspaceId="workspace" visible /></CreatorLocaleProvider>));
    expect(container.textContent).toContain("Use this address");
    expect(container.textContent).not.toContain("使用此地址");
    expect(container.querySelector("input")!.value).toBe("http://localhost:9000/draft");
    expect(container.querySelector("section")!.getAttribute("aria-label")).toBe("Agent connection settings");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("re-projects transient notices while preserving unknown diagnostic text and inserted values", () => {
    const messages = resolveCreatorLocaleMessages("en-US");
    expect(localizeCreatorPresentation("Mock 地址已复制。", messages)).toBe("Mock address copied.");
    expect(localizeCreatorPresentation("已选择 $&/{1}，下一次请求生效。", messages)).toBe("Selected $&/{1} for the next request.");
    expect(localizeCreatorPresentation("CUSTOM_PROTOCOL_ERROR: 403", messages)).toBe("CUSTOM_PROTOCOL_ERROR: 403");
    expect(localizeCreatorPresentation("custom output", resolveCreatorLocaleMessages("zh-CN"))).toBe("custom output");
  });

  it("falls back for missing translations and preserves placeholder values as data", () => {
    const group = CREATOR_LOCALES["en-US"].agentConnection;
    const original = group.useThisAddress;
    group.useThisAddress = "";
    try {
      const warning = vi.fn();
      expect(resolveCreatorLocaleMessages("en-US", warning).agentConnection.useThisAddress).toBe("使用此地址");
      expect(warning).toHaveBeenCalledWith("agentConnection.useThisAddress");
    } finally { group.useThisAddress = original; }
    expect(formatLocaleMessage("Selected {0}; count {1}", "$&/{1}", 2)).toBe("Selected $&/{1}; count 2");
  });
});
