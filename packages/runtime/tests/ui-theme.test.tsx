// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { AGENT_UI_DEFAULT_THEME, CanonicalThemeSwitchPlugin } from "@za38.03/agent-ui-plugins";
import { AgentApplication, AgentUICompatibilityRoot, AgentUIProjectProvider, createAgentUIProject, createPluginCapabilityCatalog, usePluginService } from "../src/ui/index.js";
import { AGENT_UI_THEME_SERVICE, type AgentUIThemeService } from "../src/ui/services/agent-ui-theme.js";
import { createAgentUIThemeService } from "../../plugins/src/plugins/theme-provider/adapters/presentation/theme-service";
import type { ResolvedAgentUICompatibilityConfig } from "../src/ui/application/compatibility-config.js";

const cleanups: (() => void)[] = [];
afterEach(() => act(() => cleanups.splice(0).reverse().forEach(cleanup => cleanup())));
function setup() {
  const manifest = (id: string) => ({ id, name: id, version: "1.0.0", description: "Theme integration test" });
  const provider = { manifest: { ...manifest("theme-provider"), capabilities: ["headless"] }, provides: [AGENT_UI_THEME_SERVICE], inject: [], optionalInject: [],
    setup: ({ services }: { services: { provide(id: string, value: unknown): void } }) => services.provide(AGENT_UI_THEME_SERVICE, createAgentUIThemeService()), Component: () => null };
  const picker = { manifest: manifest("theme-switch"), provides: [], inject: [AGENT_UI_THEME_SERVICE], optionalInject: [], Component: () => {
    const service = usePluginService<AgentUIThemeService>(AGENT_UI_THEME_SERVICE);
    return <><input defaultValue="Unsent draft" /><CanonicalThemeSwitchPlugin service={service} /></>;
  } };
  const project = createAgentUIProject({
    appUIModelSource: JSON.stringify({ applicationPlugins: [{ pluginId: "theme-provider" }], root: { type: "slot", plugins: [{ pluginId: "theme-switch" }] } }),
    pluginCapabilityCatalog: createPluginCapabilityCatalog([provider, picker].map(definition => ({ ...definition, loadDefinition: async () => definition }))),
    capabilityCatalogRevision: "a".repeat(64), defaultLocale: "en-US",
  });
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  cleanups.push(() => container.remove(), () => root.unmount());
  const pick = async (theme: string) => { await act(async () => {
    const select = container.querySelector("select")!; select.value = theme; select.dispatchEvent(new Event("change", { bubbles: true }));
  }); };
  const ready = async () => { await act(async () => { await vi.waitFor(() => expect(container.querySelector("select")).not.toBeNull()); }); };
  const displayed = () => container.querySelector("[data-agent-ui-root]")?.getAttribute("data-theme");
  return { project, container, root, pick, ready, displayed };
}

it("native Agent retains internal switching without a project theme setting", async () => {
  const ui = setup();
  await act(async () => ui.root.render(<AgentApplication project={ui.project} />));
  await ui.ready();
  expect(ui.project).not.toHaveProperty("theme");
  expect(ui.displayed()).toBe(AGENT_UI_DEFAULT_THEME);
  await ui.pick("dark");
  expect(ui.displayed()).toBe("dark");
  expect(ui.container.querySelector("input")?.value).toBe("Unsent draft");
});

it("compatibility mounts emit controlled requests and release ownership without remounting", async () => {
  const ui = setup(), emit = vi.fn();
  const config: ResolvedAgentUICompatibilityConfig = { endpoint: "/agent", locale: "en-US" };
  const render = async (theme?: "light" | "dark" | "violet") => { await act(async () => ui.root.render(
    <AgentUIProjectProvider value={ui.project}><AgentUICompatibilityRoot config={{ ...config, ...(theme ? { theme } : {}) }} emit={emit} /></AgentUIProjectProvider>,
  )); };
  await render(); await ui.ready();
  expect(ui.displayed()).toBe(AGENT_UI_DEFAULT_THEME);
  const input = ui.container.querySelector("input")!;
  input.value = "Edited unsent draft";
  await ui.pick("dark");
  expect(ui.displayed()).toBe("dark");
  expect(emit).toHaveBeenCalledWith("theme-change", { theme: "dark" });
  await render("light");
  emit.mockClear();
  await ui.pick("dark");
  expect(ui.displayed()).toBe("light");
  expect(ui.container.querySelector("select")?.value).toBe("light");
  expect(emit).toHaveBeenCalledExactlyOnceWith("theme-change", { theme: "dark" });
  await render("dark");
  expect(ui.displayed()).toBe("dark");
  await render(); await ui.pick("violet");
  expect(ui.displayed()).toBe("violet");
  expect(ui.container.querySelector("input")).toBe(input);
  expect(input.value).toBe("Edited unsent draft");
});
