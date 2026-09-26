// @vitest-environment jsdom

import {
  act,
  create,
  type ReactTestRenderer,
} from "react-test-renderer";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Button } from "@agent-ui/react";
import {
  ConversationRuntimeProvider,
  type ConversationAgentFactory,
} from "@agent-ui/runtime-conversation";
import type { AppUIModel } from "../framework/contracts/app-ui-model";
import { parseAppUIRuntimeModel } from "../framework/contracts/app-ui-runtime-model";
import {
  capabilityCatalogRevision,
  pluginCapabilityCatalog,
} from "../plugins";
import { createConversationServiceThreadBinding } from "../agent-ui/conversation/threads/conversation-service-thread-binding";
import {
  AgentRuntimeProvider,
  PluginInstanceProvider,
} from "../runtime/context";
import { buildRuntimeComposition } from "../runtime/composition";
import { createInstanceActions } from "../runtime/plugins/PluginServiceRuntime";
import {
  createPluginRegistry,
  PluginServiceRuntime,
  PluginServiceRuntimeContext,
  UIPluginRuntime,
  type UIPluginRuntimeActions,
} from "../runtime/plugins";
import { createStaticAgentRuntime } from "./agent-runtime-fixture";
import { ThemeSwitchPlugin } from "../plugins/theme-switch";
import { themeProviderPlugin } from "../plugins/theme-provider/definition";
import { localeProviderPlugin } from "../plugins/locale-provider/definition";
import { AGENT_UI_LOCALE_SERVICE, type AgentUILocaleService } from "../services/agent-ui-locale";
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
    },
    "locale-provider-main": {
      id: "locale-provider-main",
      pluginId: "locale-provider",
      enabled: true,
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
const mountedRoots: Root[] = [];

function createAgent(): ReturnType<ConversationAgentFactory> {
  return {
    threadId: "theme-switch-runtime",
    runAgent: vi.fn(),
    abortRun: vi.fn(),
    subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
  } as never;
}

afterEach(() => {
  for (const renderer of mountedRenderers.splice(0)) renderer.unmount();
  for (const root of mountedRoots.splice(0)) {
    act(() => root.unmount());
  }
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
      localeProviderPlugin,
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
            <ThemeSwitchPlugin renderSlot={() => null} renderScopedSlot={() => null} />
          </PluginInstanceProvider>
        </PluginServiceRuntimeContext.Provider>,
      );
    });
    if (renderer === undefined) throw new Error("Theme switch was not rendered");
    mountedRenderers.push(renderer);

    const control = () => renderer!.root.findByType(Button);
    const root = () => renderer!.root.findByProps({ "data-ui-plugin": "theme-switch" });

    expect(control().props).toMatchObject({
      "aria-label": "切换到浅色模式",
      "aria-pressed": true,
      title: "切换到浅色模式",
    });
    expect(root().props["aria-label"]).toBe("主题设置");
    expect(root().props).toMatchObject({
      className: "theme-switch-plugin agent-ui-conversation dark",
      "data-theme": "dark",
    });

    await act(async () => {
      control().props.onClick();
      await Promise.resolve();
    });

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
      runtime.get<AgentUILocaleService>(AGENT_UI_LOCALE_SERVICE)?.setLocale("en-US");
    });
    expect(root().props["aria-label"]).toBe("Theme settings");
    expect(control().props).toMatchObject({
      "aria-label": "Switch to dark mode",
      title: "Switch to dark mode",
    });

    await act(async () => {
      control().props.onClick();
    });
    expect(control().props).toMatchObject({
      "aria-label": "Switch to light mode",
      title: "Switch to light mode",
    });
  });

  it("renders in the production Conversation header Slot and toggles the shared Runtime theme", async () => {
    const appUIModel: AppUIModel = {
      applicationPlugins: [
        {
          id: "agent-conversation-data-source-main",
          pluginId: "conversation-data-source",
          enabled: true,
        },
        {
          id: "agent-conversation-service-main",
          pluginId: "conversation-service",
          enabled: true,
        },
        {
          id: "theme-provider-main",
          pluginId: "theme-provider",
          enabled: true,
        },
      ],
      root: {
        type: "slot",
        plugins: [{
          id: "agent-conversation-surface-main",
          pluginId: "conversation-surface",
          enabled: true,
          slots: {
            headerActions: [{
              id: "theme-switch-main",
              pluginId: "theme-switch",
              enabled: true,
            }],
          },
        }],
      },
    };
    const composition = await buildRuntimeComposition({
      appUIModelSource: JSON.stringify(appUIModel),
      capabilityCatalog: pluginCapabilityCatalog,
      capabilityCatalogRevision,
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    mountedRoots.push(root);
    const binding = createConversationServiceThreadBinding();
    const agent = createAgent();
    const pluginRuntime = createStaticAgentRuntime({
      conversation: { id: "theme-switch-runtime" },
      messages: [],
      state: null,
      run: { status: "idle" },
      executions: [],
      interrupts: [],
    });
    const actions: UIPluginRuntimeActions = {
      sendMessage: vi.fn(async () => undefined),
      resumeInterrupts: vi.fn(async () => undefined),
      startNewConversation: vi.fn(async () => undefined),
      abortRun: vi.fn(),
    };

    await act(async () => {
      root.render(
        <ConversationRuntimeProvider
          endpoint="http://example.test/agent"
          threadBinding={binding}
          unstable_agentFactory={({ threadId }) => ({ ...agent, threadId }) as never}
        >
          <AgentRuntimeProvider runtime={pluginRuntime}>
            <UIPluginRuntime
              actions={actions}
              model={composition.runtimeModel}
              registry={composition.activeRegistry}
            />
          </AgentRuntimeProvider>
        </ConversationRuntimeProvider>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const header = container.querySelector(
      '[data-conversation-surface-slot="headerActions"]',
    );
    const control = header?.querySelector("button") as HTMLButtonElement | null;
    expect(control).not.toBeNull();
    expect(control?.getAttribute("aria-pressed")).toBe("true");
    expect(header?.querySelector('[data-ui-plugin="theme-switch"]')).not.toBeNull();

    await act(async () => {
      control?.click();
      await Promise.resolve();
    });

    expect(control?.getAttribute("aria-pressed")).toBe("false");
    expect(header?.querySelector('[data-ui-plugin="theme-switch"]')?.getAttribute("data-theme"))
      .toBe("light");
  });
});
