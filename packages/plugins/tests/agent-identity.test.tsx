import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AgentUISidebarFrame } from "../src/internal/sidebar-frame";
import { AgentUIRoot } from "../src/internal/style-boundary/AgentUIRoot";
import { AgentUILocaleProvider } from "../src/locale";
import { AgentIdentityPlugin } from "../../source-registry/registry/items/plugin-agent-identity/files/plugins/agent-identity";
import { agentIdentityConfig } from "../../source-registry/registry/items/plugin-agent-identity/files/plugins/agent-identity/config";
import { agentIdentityPlugin } from "../../source-registry/registry/items/plugin-agent-identity/files/plugins/agent-identity/definition";
import { PluginServiceRuntimeContext } from "../../source-registry/registry/items/foundation-core-runtime/files/runtime/plugins/PluginServiceContext";
import { PluginServiceRuntime } from "../../source-registry/registry/items/foundation-core-runtime/files/runtime/plugins/PluginServiceRuntime";

it("shows localized defaults and editable brand content without a navigation service", async () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ width: 900, height: 500, left: 0, right: 900, top: 0, bottom: 500, x: 0, y: 0, toJSON() {} }));
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host); const runtime = new PluginServiceRuntime();
  const original = { ...agentIdentityConfig };
  const header = <AgentIdentityPlugin renderSlot={() => null} renderScopedSlot={() => null} />;
  const view = (locale: "en-US" | "zh-CN") => <PluginServiceRuntimeContext.Provider value={runtime}><AgentUILocaleProvider locale={locale}><AgentUIRoot theme="light"><AgentUISidebarFrame header={header} items={[]} defaultActive={null}>Main</AgentUISidebarFrame></AgentUIRoot></AgentUILocaleProvider></PluginServiceRuntimeContext.Provider>;
  try {
    expect(agentIdentityPlugin.manifest.sidebar).toBeUndefined();
    expect(agentIdentityPlugin.provides ?? []).toEqual([]);
    await act(async () => root.render(view("en-US")));
    expect(host.querySelector(".agent-identity-name")?.textContent).toBe("Agent");
    await act(async () => root.render(view("zh-CN")));
    expect(host.querySelector(".agent-identity-name")?.textContent).toBe("智能助手");
    agentIdentityConfig.name = "智能研发助手";
    agentIdentityConfig.logo = "/company.svg";
    agentIdentityConfig.description = "Company Agent";
    await act(async () => root.render(view("en-US")));
    expect(host.querySelector(".agent-identity-name")?.textContent).toBe("智能研发助手");
    expect(host.querySelector("img")?.getAttribute("src")).toBe("/company.svg");
    expect(host.textContent).toContain("Company Agent");
  } finally {
    Object.assign(agentIdentityConfig, original); delete agentIdentityConfig.logo; delete agentIdentityConfig.description;
    await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks();
  }
});
