// @vitest-environment jsdom

import {
  act,
  create,
  type ReactTestRenderer,
} from "react-test-renderer";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NativeSelect } from "@agent-ui/react";
import {
  ConversationRuntimeProvider,
  type ConversationAgentFactory,
} from "@agent-ui/runtime-conversation";
import type { AppUIModel } from "../../../project-control/src/framework/contracts/app-ui-model";
import { parseAppUIRuntimeModel } from "../../../project-control/src/framework/contracts/app-ui-runtime-model";
import {
  capabilityCatalogRevision,
  pluginCapabilityCatalog,
} from "../../../source-registry/registry/items/foundation-core/files/plugins/index";
import { createConversationServiceThreadBinding } from "../../../source-registry/registry/items/foundation-core-adapters/files/agent-ui/conversation/threads/conversation-service-thread-binding";
import {
  AgentRuntimeProvider,
  PluginInstanceProvider,
} from "../../../source-registry/registry/items/foundation-core-runtime/files/runtime/context/index";
import { buildRuntimeComposition } from "../../../source-registry/registry/items/foundation-core-runtime/files/runtime/composition/index";
import { createInstanceActions } from "../../../source-registry/registry/items/foundation-core-runtime/files/runtime/plugins/PluginServiceRuntime";
import {
  createPluginRegistry,
  PluginServiceRuntime,
  PluginServiceRuntimeContext,
  UIPluginRuntime,
  type UIPluginRuntimeActions,
} from "../../../source-registry/registry/items/foundation-core-runtime/files/runtime/plugins/index";
import { createStaticAgentRuntime } from "../../../project-control/tests/support/agent-runtime-fixture";
import { ThemeSwitchPlugin } from "../../../source-registry/registry/items/plugin-theme-switch/files/plugins/theme-switch/index";
import { themeProviderPlugin } from "../../../source-registry/registry/items/plugin-theme-provider/files/plugins/theme-provider/definition";
import { localeProviderPlugin } from "../../../source-registry/registry/items/plugin-locale-provider/files/plugins/locale-provider/definition";
import { AGENT_UI_LOCALE_SERVICE, type AgentUILocaleService } from "../../../source-registry/registry/items/foundation-core-application/files/services/agent-ui-locale";
import { themeSwitchPlugin } from "../../../source-registry/registry/items/plugin-theme-switch/files/plugins/theme-switch/definition";

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
  it("selects all presets through the shared theme service with localized labels", async () => {
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

    const control = () => renderer!.root.findByType(NativeSelect);
    const root = () => renderer!.root.findByProps({ "data-ui-plugin": "theme-switch" });

    expect(control().props).toMatchObject({ "aria-label": "主题设置", value: "light" });
    expect(root().props).toMatchObject({ "data-theme": "light", "data-color-scheme": "light" });
    const options = () => renderer!.root.findAllByType("option");
    expect(options().map((option) => option.children.join(""))).toEqual(["浅色", "深色", "紫色"]);
    for (const preset of ["dark", "violet", "light"] as const) {
      await act(async () => { control().props.onChange({ currentTarget: { value: preset } }); });
      expect(control().props.value).toBe(preset);
      expect(root().props["data-theme"]).toBe(preset);
      expect(root().props.className.includes(" dark")).toBe(preset === "dark");
    }
    await act(async () => {
      runtime.get<AgentUILocaleService>(AGENT_UI_LOCALE_SERVICE)?.setLocale("en-US");
    });
    expect(control().props["aria-label"]).toBe("Theme settings");
    expect(options().map((option) => option.children.join(""))).toEqual(["Light", "Dark", "Violet"]);
  });

  it("renders a preset picker in the production Conversation header Slot", async () => {
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
    const control = header?.querySelector("select") as HTMLSelectElement | null;
    expect(control).not.toBeNull();
    expect(control?.value).toBe("light");
    expect(header?.querySelector('[data-ui-plugin="theme-switch"]')).not.toBeNull();

    await act(async () => {
      if (control) { control.value = "violet"; control.dispatchEvent(new Event("change", { bubbles: true })); }
      await Promise.resolve();
    });

    expect(control?.value).toBe("violet");
    expect(header?.querySelector('[data-ui-plugin="theme-switch"]')?.getAttribute("data-theme"))
      .toBe("violet");
  });
});
