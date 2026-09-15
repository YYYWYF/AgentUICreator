// @vitest-environment jsdom

import { useEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAgentUIThemeMode } from "../agent-ui/theme/useAgentUITheme";
import { themeProviderPlugin } from "../plugins/theme-provider/definition";
import {
  createPluginRegistry,
  PluginServiceRuntime,
  PluginServiceRuntimeContext,
} from "../runtime/plugins";
import {
  AGENT_UI_THEME_SERVICE,
  type AgentUIThemeService,
} from "../services/agent-ui-theme";
import type { AppUIRuntimeModel } from "../framework/contracts/app-ui-runtime-model";

const runtimeActions = {
  sendMessage: async () => undefined,
  resumeInterrupts: async () => undefined,
  startNewConversation: async () => undefined,
  abortRun: () => undefined,
};

const model: AppUIRuntimeModel = {
  root: {
    type: "slot",
    id: "theme-bridge-test-root",
    slotId: "theme-bridge-test-root",
  },
  pluginInstances: {
    "theme-bridge-provider-main": {
      id: "theme-bridge-provider-main",
      pluginId: "theme-provider",
      enabled: true,
      props: { defaultMode: "dark" },
    },
  },
};

function ThemeProbe({ onMount }: { onMount: () => void }) {
  const theme = useAgentUIThemeMode();

  useEffect(() => onMount(), [onMount]);

  return (
    <div
      className={theme === "dark" ? "dark" : undefined}
      data-theme={theme}
    />
  );
}

const mountedRenderers: ReactTestRenderer[] = [];
const serviceRuntimes: PluginServiceRuntime[] = [];

afterEach(() => {
  for (const renderer of mountedRenderers.splice(0)) renderer.unmount();
  for (const runtime of serviceRuntimes.splice(0)) runtime.dispose();
  vi.restoreAllMocks();
});

describe("assistant-ui theme bridge", () => {
  it("updates the theme without remounting its conversation consumer", async () => {
    const serviceRuntime = new PluginServiceRuntime();
    serviceRuntime.reconcile(
      model,
      createPluginRegistry([themeProviderPlugin]),
      runtimeActions,
    );
    const themeService = serviceRuntime.get<AgentUIThemeService>(
      AGENT_UI_THEME_SERVICE,
    );
    if (themeService === undefined) throw new Error("Theme service was not created.");
    serviceRuntimes.push(serviceRuntime);

    const onMount = vi.fn();
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(
        <PluginServiceRuntimeContext.Provider value={serviceRuntime}>
          <ThemeProbe onMount={onMount} />
        </PluginServiceRuntimeContext.Provider>,
      );
      await Promise.resolve();
    });
    if (renderer === undefined) throw new Error("Theme renderer was not created.");
    mountedRenderers.push(renderer);

    const root = () => renderer!.root.findByType("div");
    expect(root().props).toMatchObject({
      className: "dark",
      "data-theme": "dark",
    });
    expect(onMount).toHaveBeenCalledTimes(1);

    await act(async () => {
      themeService.setMode("light");
      await Promise.resolve();
    });

    expect(root().props).toMatchObject({
      className: undefined,
      "data-theme": "light",
    });
    expect(onMount).toHaveBeenCalledTimes(1);
  });
});
