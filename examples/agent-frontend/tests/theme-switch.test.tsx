// @vitest-environment jsdom

import {
  act,
  create,
  type ReactTestRenderer,
} from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Button } from "@agent-ui/react";
import { parseAppUIRuntimeModel } from "../framework/contracts/app-ui-runtime-model";
import { PluginInstanceProvider } from "../runtime/context";
import { createInstanceActions } from "../runtime/plugins/PluginServiceRuntime";
import {
  createPluginRegistry,
  PluginServiceRuntime,
  PluginServiceRuntimeContext,
} from "../runtime/plugins";
import { ThemeSwitchPlugin } from "../plugins/theme-switch";
import { themeProviderPlugin } from "../plugins/theme-provider/definition";
import { themeSwitchPlugin } from "../plugins/theme-switch/definition";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const model = parseAppUIRuntimeModel({
  root: { type: "slot", id: "theme-switch-root", slotId: "theme-controls" },
  pluginInstances: {
    "theme-provider-main": {
      id: "theme-provider-main",
      pluginId: "theme-provider",
      enabled: true,
      props: { defaultMode: "light" },
    },
    "theme-switch-main": {
      id: "theme-switch-main",
      pluginId: "theme-switch",
      enabled: true,
      mount: { slotId: "theme-controls" },
    },
  },
});

const mountedRenderers: ReactTestRenderer[] = [];
const runtimes: PluginServiceRuntime[] = [];

afterEach(() => {
  for (const renderer of mountedRenderers.splice(0)) renderer.unmount();
  for (const runtime of runtimes.splice(0)) runtime.dispose();
  vi.restoreAllMocks();
});

describe("theme-switch plugin", () => {
  it("toggles the shared theme service and exposes accessible Button state", async () => {
    const actions = {
      sendMessage: vi.fn(async () => undefined),
      resumeInterrupts: vi.fn(async () => undefined),
      startNewConversation: vi.fn(async () => undefined),
      abortRun: vi.fn(),
    };
    const registry = createPluginRegistry([
      themeProviderPlugin,
      themeSwitchPlugin,
    ]);
    const runtime = new PluginServiceRuntime();
    runtime.reconcile(model, registry, actions);
    runtimes.push(runtime);

    const instance = model.pluginInstances["theme-switch-main"]!;
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(
        <PluginServiceRuntimeContext.Provider value={runtime}>
          <PluginInstanceProvider
            actions={createInstanceActions(instance, actions)}
            events={runtime.getEvents("theme-switch-main")!}
            instance={instance}
          >
            <ThemeSwitchPlugin renderSlot={() => null} />
          </PluginInstanceProvider>
        </PluginServiceRuntimeContext.Provider>,
      );
    });
    if (renderer === undefined) throw new Error("Theme switch was not rendered");
    mountedRenderers.push(renderer);

    const control = () => renderer!.root.findByType(Button);
    const root = () => renderer!.root.findByProps({ "data-ui-plugin": "theme-switch" });

    expect(control().props).toMatchObject({
      "aria-label": "切换到深色模式",
      "aria-pressed": false,
      title: "切换到深色模式",
    });
    expect(root().props).toMatchObject({
      className: "theme-switch-plugin agent-ui-conversation",
      "data-theme": "light",
    });

    await act(async () => {
      control().props.onClick();
      await Promise.resolve();
    });

    expect(control().props).toMatchObject({
      "aria-label": "切换到浅色模式",
      "aria-pressed": true,
      title: "切换到浅色模式",
    });
    expect(root().props).toMatchObject({
      className: "theme-switch-plugin agent-ui-conversation dark",
      "data-theme": "dark",
    });
  });
});
