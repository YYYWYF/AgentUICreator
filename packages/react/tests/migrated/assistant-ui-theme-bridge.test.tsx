// @vitest-environment jsdom

import { AgentUIRoot, type AgentUIThemeConfig } from "@agent-ui/react";
import { agentUIThemeConfig } from "../../../source-registry/registry/items/foundation-core-adapters/files/agent-ui/theme/theme-config";
import { useEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAgentUITheme } from "../../../source-registry/registry/items/foundation-core-adapters/files/agent-ui/theme/useAgentUITheme";
import { themeProviderPlugin } from "../../../source-registry/registry/items/plugin-theme-provider/files/plugins/theme-provider/definition";
import {
  createPluginRegistry,
  PluginServiceRuntime,
  PluginServiceRuntimeContext,
} from "../../../source-registry/registry/items/foundation-core-runtime/files/runtime/plugins/index";
import {
  AGENT_UI_THEME_SERVICE,
  type AgentUIThemeService,
} from "../../../source-registry/registry/items/foundation-core-application/files/services/agent-ui-theme";
import type { AppUIRuntimeModel } from "../../../project-control/src/framework/contracts/app-ui-runtime-model";

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
    },
  },
};

function ConversationConsumer({ onMount }: { onMount: () => void }) {
  useEffect(() => onMount(), [onMount]);
  return <span data-conversation-consumer="" />;
}
function ThemeProbe({ onMount }: { onMount: () => void }) {
  const theme = useAgentUITheme();
  return <AgentUIRoot theme={theme}><ConversationConsumer onMount={onMount} /></AgentUIRoot>;
}

const mountedRenderers: ReactTestRenderer[] = [];
const serviceRuntimes: PluginServiceRuntime[] = [];

afterEach(() => {
  for (const renderer of mountedRenderers.splice(0)) renderer.unmount();
  for (const runtime of serviceRuntimes.splice(0)) runtime.dispose();
  vi.restoreAllMocks();
});

describe("assistant-ui theme bridge", () => {
  it("uses the project default when the optional provider is removed", async () => {
    const runtime = new PluginServiceRuntime();
    serviceRuntimes.push(runtime);
    const config: AgentUIThemeConfig = agentUIThemeConfig;
    const previous = config.theme;
    let renderer: ReactTestRenderer | undefined;
    try {
      config.theme = "violet";
      await act(async () => {
        renderer = create(<PluginServiceRuntimeContext.Provider value={runtime}><ThemeProbe onMount={() => undefined} /></PluginServiceRuntimeContext.Provider>);
      });
      if (renderer === undefined) throw new Error("Theme renderer was not created.");
      mountedRenderers.push(renderer);
      expect(renderer.root.findByProps({ "data-agent-ui-root": "" }).props).toMatchObject({ "data-theme": "violet", "data-color-scheme": "light" });
    } finally { config.theme = previous; }
  });
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

    const root = () => renderer!.root.findByProps({ "data-agent-ui-root": "" });
    expect(root().props).toMatchObject({
      className: "agent-ui-root",
      "data-theme": "light",
    });
    expect(onMount).toHaveBeenCalledTimes(1);

    await act(async () => {
      themeService.setTheme("dark");
      await Promise.resolve();
    });

    expect(root().props).toMatchObject({
      className: "agent-ui-root dark",
      "data-theme": "dark",
    });
    expect(onMount).toHaveBeenCalledTimes(1);
    for (const theme of ["violet", "light"] as const) {
      await act(async () => { themeService.setTheme(theme); });
      expect(root().props).toMatchObject({ "data-theme": theme, "data-color-scheme": "light", className: "agent-ui-root" });
      expect(onMount).toHaveBeenCalledTimes(1);
    }
  });
});
