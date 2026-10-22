// @vitest-environment jsdom
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CanonicalThemeSwitchPlugin, type AgentUITheme } from "@za38.03/agent-ui-plugins";
import { AgentUIThemeBridge } from "../resources/registry/items/foundation/core-adapters/files/agent-ui/theme/AgentUIThemeBridge";
import { agentUIThemeConfig } from "../resources/registry/items/foundation/core-adapters/files/agent-ui/theme/theme-config";
import { themeProviderPlugin } from "../resources/registry/items/plugin/theme-provider/files/plugins/theme-provider/definition";
import { createPluginRegistry, PluginServiceRuntime, PluginServiceRuntimeContext } from "../resources/registry/items/foundation/core-runtime/files/runtime/plugins";
import { AGENT_UI_THEME_SERVICE, type AgentUIThemeService } from "../resources/registry/items/foundation/core-application/files/services/agent-ui-theme";

const actions = { sendMessage: async () => {}, resumeInterrupts: async () => {}, startNewConversation: async () => {}, abortRun: () => {} };
const cleanups: (() => void)[] = [];
afterEach(() => { act(() => cleanups.splice(0).reverse().forEach(cleanup => cleanup())); });

function setup(withService = true) {
  const runtime = new PluginServiceRuntime();
  if (withService) runtime.reconcile({ root: { type: "slot", id: "root", slotId: "root" }, pluginInstances: { theme: { id: "theme", pluginId: "theme-provider", enabled: true } } }, createPluginRegistry([themeProviderPlugin]), actions);
  const service = runtime.get<AgentUIThemeService>(AGENT_UI_THEME_SERVICE);
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  cleanups.push(() => { runtime.dispose(); container.remove(); }, () => root.unmount());
  const mounts = vi.fn();
  function Conversation() {
    useEffect(() => { mounts(); }, []);
    return <><p>Existing conversation</p><input defaultValue="Draft message" /><CanonicalThemeSwitchPlugin service={service} /></>;
  }
  const render = (theme?: AgentUITheme, onThemeChange?: (theme: AgentUITheme) => void) => act(() => root.render(
    <PluginServiceRuntimeContext.Provider value={runtime}><AgentUIThemeBridge theme={theme} onThemeChange={onThemeChange}><Conversation /></AgentUIThemeBridge></PluginServiceRuntimeContext.Provider>,
  ));
  const pick = (theme: AgentUITheme) => act(() => {
    const select = container.querySelector("select")!;
    select.value = theme;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const displayed = () => container.querySelector("[data-agent-ui-root]")!.getAttribute("data-theme");
  return { root, runtime, service, container, mounts, render, pick, displayed, Conversation };
}

describe("Agent theme parameter", () => {
  it("updates all presets while preserving the mounted conversation and edited draft", () => {
    const ui = setup();
    const onThemeChange = vi.fn();
    ui.render("light", onThemeChange);
    const input = ui.container.querySelector("input")!;
    input.value = "Unsent edited draft";
    for (const theme of ["dark", "violet", "light"] as const) {
      ui.render(theme, onThemeChange);
      expect(ui.displayed()).toBe(theme);
      expect(ui.service!.getTheme()).toBe(theme);
      expect(ui.container.querySelector("select")!.value).toBe(theme);
      expect(ui.container.querySelector("input")).toBe(input);
      expect(input.value).toBe("Unsent edited draft");
      expect(ui.container.querySelector("p")!.textContent).toBe("Existing conversation");
    }
    expect(ui.mounts).toHaveBeenCalledTimes(1);
    expect(onThemeChange).not.toHaveBeenCalled();
  });

  it("retains project defaults and the existing picker when theme is omitted", () => {
    const ui = setup();
    const onThemeChange = vi.fn();
    ui.render(undefined, onThemeChange);
    expect(ui.displayed()).toBe(agentUIThemeConfig.theme);
    ui.pick("dark");
    expect(ui.displayed()).toBe("dark");
    expect(ui.service!.getTheme()).toBe("dark");
    expect(onThemeChange).toHaveBeenCalledExactlyOnceWith("dark");
  });

  it("keeps the picker consistent when a controlled Host retains its theme", () => {
    const ui = setup();
    const onThemeChange = vi.fn();
    ui.render("violet", onThemeChange);
    ui.pick("dark");
    expect(onThemeChange).toHaveBeenCalledExactlyOnceWith("dark");
    expect(ui.displayed()).toBe("violet");
    expect(ui.service!.getTheme()).toBe("violet");
    expect(ui.container.querySelector("select")!.value).toBe("violet");
  });

  it("allows the Host to accept picker requests through onThemeChange", () => {
    const ui = setup();
    const changes = vi.fn();
    function ControlledHost() {
      const [theme, setTheme] = useState<AgentUITheme>("light");
      return <PluginServiceRuntimeContext.Provider value={ui.runtime}><AgentUIThemeBridge theme={theme} onThemeChange={next => { changes(next); setTheme(next); }}><ui.Conversation /></AgentUIThemeBridge></PluginServiceRuntimeContext.Provider>;
    }
    act(() => ui.root.render(<ControlledHost />));
    ui.pick("dark");
    expect(ui.displayed()).toBe("dark");
    expect(ui.service!.getTheme()).toBe("dark");
    expect(changes).toHaveBeenCalledExactlyOnceWith("dark");
    expect(ui.mounts).toHaveBeenCalledTimes(1);
  });

  it("supports explicit themes and the project fallback without an optional theme service", () => {
    const ui = setup(false);
    ui.render();
    expect(ui.displayed()).toBe(agentUIThemeConfig.theme);
    ui.render("dark");
    expect(ui.displayed()).toBe("dark");
    ui.render("violet");
    expect(ui.displayed()).toBe("violet");
    expect(ui.mounts).toHaveBeenCalledTimes(1);
  });
});
