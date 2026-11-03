// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import {
  AGENT_UI_DEFAULT_THEME, AgentUILocaleProvider,
  useAgentUILocale, useAgentUILocaleCode, usePluginService,
  type AgentUITheme, type AgentUILocaleCode,
} from "@za38.03/agent-ui-plugins";
import { useAgentUITheme, AgentUIProjectProvider, createAgentUIProject, createPluginCapabilityCatalog } from "@za38.03/agent-ui-runtime/ui";
import { AGENT_UI_THEME_SERVICE, type AgentUIThemeService } from "@za38.03/agent-ui-runtime/ui/services/agent-ui-theme";
import { AGENT_UI_LOCALE_SERVICE, type AgentUILocaleService } from "@za38.03/agent-ui-runtime/ui/services/agent-ui-locale";
import { AgentUILocaleBridge } from "@za38.03/agent-ui-runtime/ui/agent-ui/i18n/AgentUILocaleBridge";
import { useAgentUIThemeSnapshot, useAgentUILocaleSnapshot } from "@za38.03/agent-ui-plugins/plugin-support";
import { PluginServiceRuntimeProvider } from "../src/plugin-api/PluginServiceContext";
import { ThemeSwitchPlugin as NpmTheme } from "../dist/theme-switch/index.js";
import { LocaleSwitchPlugin as NpmLocale } from "../dist/locale-switch/index.js";
import { ThemeSwitchPlugin as SourceTheme } from "../dist/sources/takeover/theme-switch/index";
import { LocaleSwitchPlugin as SourceLocale } from "../dist/sources/takeover/locale-switch/index";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); });

function themeStore(initial: AgentUITheme) {
  let theme = initial;
  const listeners = new Set<() => void>();
  return { listeners, getTheme: () => theme,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setTheme(next: AgentUITheme) { theme = next; listeners.forEach(listener => listener()); },
  };
}
function localeStore(initial: AgentUILocaleCode) {
  let snapshot = { locale: initial, direction: "ltr" as const };
  const listeners = new Set<() => void>();
  return { listeners, getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setLocale(next: AgentUILocaleCode) { snapshot = { ...snapshot, locale: next }; listeners.forEach(listener => listener()); },
  };
}

it("reads through hooks, switches through injected services, and releases old subscriptions on service replacement", async () => {
  const theme = themeStore("light"), locale = localeStore("en-US");
  const nextTheme = themeStore("dark"), nextLocale = localeStore("zh-CN");
  const services = new Map<string, unknown>();
  const listeners = new Set<() => void>(); let revision = 0;
  const runtime = {
    get: <T,>(name: string) => services.get(name) as T | undefined,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getRevision: () => revision,
  };
  let themeService: AgentUIThemeService | undefined;
  let localeService: AgentUILocaleService | undefined;
  function Consumer() {
    themeService = usePluginService<AgentUIThemeService>(AGENT_UI_THEME_SERVICE);
    localeService = usePluginService<AgentUILocaleService>(AGENT_UI_LOCALE_SERVICE);
    const value = useAgentUITheme(); const code = useAgentUILocaleCode();
    const messages = useAgentUILocale("accessibility");
    return <span>{value}/{code}/{messages.language}</span>;
  }
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const project = createAgentUIProject({
    appUIModelSource: JSON.stringify({ root: { type: "slot", plugins: [] } }),
    pluginCapabilityCatalog: createPluginCapabilityCatalog([]), capabilityCatalogRevision: "a".repeat(64),
    defaultLocale: "zh-CN", locales: {
      "en-US": { accessibility: { language: "Host language" } },
      "zh-CN": { accessibility: { language: "Host language" } },
    },
  });
  await act(async () => root!.render(<PluginServiceRuntimeProvider runtime={runtime}><AgentUIProjectProvider value={project}><AgentUILocaleBridge><Consumer /></AgentUILocaleBridge></AgentUIProjectProvider></PluginServiceRuntimeProvider>));
  expect(host.textContent).toBe(`${AGENT_UI_DEFAULT_THEME}/zh-CN/Host language`);
  expect(themeService).toBeUndefined(); expect(localeService).toBeUndefined();
  async function replace(themeValue?: typeof theme, localeValue?: typeof locale) {
    await act(async () => {
      if (themeValue) services.set("agent-ui.theme", themeValue); else services.delete("agent-ui.theme");
      if (localeValue) services.set("agent-ui.locale", localeValue); else services.delete("agent-ui.locale");
      revision++; listeners.forEach(listener => listener());
    });
  }
  await replace(theme, locale);
  expect(host.textContent).toBe("light/en-US/Host language");
  await act(async () => { themeService!.setTheme("violet"); localeService!.setLocale("zh-CN"); });
  expect(host.textContent).toBe("violet/zh-CN/Host language");
  await replace(nextTheme, nextLocale);
  expect(theme.listeners.size).toBe(0); expect(locale.listeners.size).toBe(0);
  expect(host.textContent).toBe("dark/zh-CN/Host language");
  await act(async () => { theme.setTheme("light"); locale.setLocale("en-US"); });
  expect(host.textContent).toBe("dark/zh-CN/Host language");
  await replace();
  expect(nextTheme.listeners.size).toBe(0); expect(nextLocale.listeners.size).toBe(0);
  expect(host.textContent).toBe(`${AGENT_UI_DEFAULT_THEME}/zh-CN/Host language`);
  await replace(nextTheme, nextLocale);
  await act(async () => root!.unmount()); root = undefined;
  expect(listeners.size).toBe(0); expect(nextTheme.listeners.size).toBe(0); expect(nextLocale.listeners.size).toBe(0);
});

it("supports explicitly supplied presentation services without a Runtime Provider", async () => {
  const theme = themeStore("dark"), locale = localeStore("zh-CN");
  function Consumer() { return <span>{useAgentUIThemeSnapshot(theme)}/{useAgentUILocaleSnapshot(locale)}</span>; }
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(<AgentUILocaleProvider locale="en-US"><Consumer /></AgentUILocaleProvider>));
  expect(host.textContent).toBe("dark/zh-CN");
  await act(async () => { theme.setTheme("light"); locale.setLocale("en-US"); });
  expect(host.textContent).toBe("light/en-US");
});

it.each([
  { name: "npm", Theme: NpmTheme, Locale: NpmLocale },
  { name: "source", Theme: SourceTheme, Locale: SourceLocale },
])("$name switches support controlled values and retain explicit service compatibility", async ({ Theme, Locale }) => {
  const theme = themeStore("dark"), locale = localeStore("zh-CN");
  const setTheme = vi.fn(), setLocale = vi.fn();
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const render = async (controlled: boolean, cancel = false) => {
    await act(async () => root!.render(<AgentUILocaleProvider locale="en-US">
      <Theme service={theme} {...(controlled ? { theme: "light", onThemeChange: setTheme } : {})} selectProps={{ "aria-label": "theme", onChange: event => { if (cancel) event.preventDefault(); } }} />
      <Locale service={locale} {...(controlled ? { locale: "en-US", onLocaleChange: setLocale } : {})} selectProps={{ "aria-label": "locale", onChange: event => { if (cancel) event.preventDefault(); } }} />
    </AgentUILocaleProvider>));
  };
  const select = (name: string) => host.querySelector<HTMLSelectElement>(`[aria-label="${name}"]`)!;
  const change = async (name: string, value: string) => { await act(async () => {
    select(name).value = value; select(name).dispatchEvent(new Event("change", { bubbles: true }));
  }); };
  await render(true);
  expect(select("theme").value).toBe("light"); expect(select("locale").value).toBe("en-US");
  expect(theme.listeners.size).toBe(0); expect(locale.listeners.size).toBe(0);
  await change("theme", "violet"); await change("locale", "zh-CN");
  expect(setTheme).toHaveBeenCalledExactlyOnceWith("violet"); expect(setLocale).toHaveBeenCalledExactlyOnceWith("zh-CN");
  expect(theme.getTheme()).toBe("dark"); expect(locale.getSnapshot().locale).toBe("zh-CN");
  await render(true, true);
  await change("theme", "dark"); await change("locale", "zh-CN");
  expect(setTheme).toHaveBeenCalledOnce(); expect(setLocale).toHaveBeenCalledOnce();
  await render(false);
  expect(theme.listeners.size).toBe(1); expect(locale.listeners.size).toBe(1);
  await change("theme", "light"); await change("locale", "en-US");
  expect(theme.getTheme()).toBe("light"); expect(locale.getSnapshot().locale).toBe("en-US");
  expect(select("theme").value).toBe("light"); expect(select("locale").value).toBe("en-US");
  await act(async () => root!.unmount()); root = undefined;
  expect(theme.listeners.size).toBe(0); expect(locale.listeners.size).toBe(0);
});
