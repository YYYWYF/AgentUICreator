// @vitest-environment jsdom

import { useEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAgentUIThemeMode } from "../agent-ui/theme/useAgentUITheme";
import { createAgentUIThemeService } from "../plugins/antd-x-theme-provider/theme-service";
import {
  createPluginRegistry,
  PluginServiceRuntime,
  PluginServiceRuntimeContext,
} from "../runtime/plugins";
import { AGENT_UI_THEME_SERVICE } from "../services/agent-ui-theme";
import type { AppUIModel } from "../framework/contracts/app-ui-model";
import type { UIPluginDefinition } from "../framework/contracts/ui-plugin";

const runtimeActions = {
  sendMessage: async () => undefined,
  resumeInterrupts: async () => undefined,
  startNewConversation: async () => undefined,
  abortRun: () => undefined,
  updateInstanceProps: () => undefined,
};

const model: AppUIModel = {
  version: "2",
  root: {
    type: "slot",
    id: "theme-bridge-test-root",
    slotId: "theme-bridge-test-root",
  },
  pluginInstances: {
    "theme-bridge-provider-main": {
      id: "theme-bridge-provider-main",
      pluginId: "theme-bridge-provider",
      enabled: true,
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
    const themeService = createAgentUIThemeService("dark", () => undefined);
    const themePlugin: UIPluginDefinition = {
      manifest: {
        id: "theme-bridge-provider",
        name: "Theme Bridge Provider",
        description: "Test-only Theme Service provider.",
        version: "1.0.0",
      },
      provides: [AGENT_UI_THEME_SERVICE],
      setup: ({ services }) => {
        services.provide(AGENT_UI_THEME_SERVICE, themeService);
      },
      Component: () => null,
    };
    const serviceRuntime = new PluginServiceRuntime();
    serviceRuntime.reconcile(
      model,
      createPluginRegistry([themePlugin]),
      runtimeActions,
    );
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
