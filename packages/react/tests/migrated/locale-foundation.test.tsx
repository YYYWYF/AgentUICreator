// @vitest-environment jsdom

import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

import { assistantUiFeedbackActionsPlugin } from "../../../source-registry/registry/items/plugin-assistant-ui-feedback-actions/files/plugins/assistant-ui-feedback-actions/definition";
import appUIJson from "../../../project-control/tests/fixtures/project/app-ui/app-ui.json";
import { agentUILocaleConfig } from "../../../source-registry/registry/items/foundation-core-adapters/files/agent-ui/i18n/locale-config";
import { AGENT_UI_LOCALES, AGENT_UI_LOCALE_METADATA } from "../../../source-registry/registry/items/foundation-core-adapters/files/agent-ui/i18n/locale-registry";
import type { AgentUILocaleMessages } from "../../../source-registry/registry/items/foundation-core-adapters/files/agent-ui/i18n/locale-types";
import { useAgentUILocale } from "../../../source-registry/registry/items/foundation-core-adapters/files/agent-ui/i18n/useAgentUILocale";
import { parseAppUIModel } from "../../../project-control/src/framework/contracts/app-ui-model";
import { parseAppUIRuntimeModel } from "../../../project-control/src/framework/contracts/app-ui-runtime-model";
import type { UIPluginDefinition } from "../../../project-control/src/framework/contracts/ui-plugin";
import { conversationServicePlugin } from "../../../source-registry/registry/items/plugin-conversation-service/files/plugins/conversation-service/definition";
import { localeProviderPlugin } from "../../../source-registry/registry/items/plugin-locale-provider/files/plugins/locale-provider/definition";
import { createAgentUILocaleService } from "../../../source-registry/registry/items/plugin-locale-provider/files/plugins/locale-provider/locale-service";
import {
  createPluginRegistry,
  PluginServiceConsumerContext,
  PluginServiceRuntime,
  PluginServiceRuntimeContext,
} from "../../../source-registry/registry/items/foundation-core-runtime/files/runtime/plugins/index";
import {
  AGENT_UI_LOCALE_SERVICE,
  type AgentUILocaleService,
} from "../../../source-registry/registry/items/foundation-core-application/files/services/agent-ui-locale";
import {
  AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE,
  AGENT_UI_CONVERSATION_SERVICE,
  type ConversationService,
} from "../../../source-registry/registry/items/foundation-core-application/files/services/conversations";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const renderers: ReactTestRenderer[] = [];
const runtimes: PluginServiceRuntime[] = [];
const actions = {
  sendMessage: vi.fn(async () => undefined),
  resumeInterrupts: vi.fn(async () => undefined),
  startNewConversation: vi.fn(async () => undefined),
  abortRun: vi.fn(),
};

const model = parseAppUIRuntimeModel({
  root: { type: "slot", id: "locale-test-root", slotId: "locale-test-slot" },
  pluginInstances: {
    "locale-provider-main": {
      id: "locale-provider-main",
      pluginId: "locale-provider",
      enabled: true,
    },
  },
});

function renderLocaleProbe(runtime: PluginServiceRuntime, namespace: "theme" | "threadList") {
  function Probe() {
    const messages = useAgentUILocale(namespace);
    return <span>{"settings" in messages ? messages.settings : messages.newThread}</span>;
  }

  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(
      <PluginServiceRuntimeContext.Provider value={runtime}>
        <PluginServiceConsumerContext.Provider
          value={{
            pluginId: "locale-probe",
            instanceId: "locale-probe-main",
            provides: [],
            inject: [],
            optionalInject: [AGENT_UI_LOCALE_SERVICE],
          }}
        >
          <Probe />
        </PluginServiceConsumerContext.Provider>
      </PluginServiceRuntimeContext.Provider>,
    );
  });
  if (renderer === undefined) throw new Error("Locale probe was not rendered");
  renderers.push(renderer);
  return renderer;
}

afterEach(() => {
  for (const renderer of renderers.splice(0)) {
    act(() => renderer.unmount());
  }
  for (const runtime of runtimes.splice(0)) runtime.dispose();
});

describe("Agent UI locale foundation", () => {
  it("registers complete messages and direction metadata for each locale", () => {
    const namespaces = Object.keys(AGENT_UI_LOCALES["en-US"]) as (keyof AgentUILocaleMessages)[];
    expect(Object.keys(AGENT_UI_LOCALES).sort()).toEqual(["en-US", "zh-CN"]);
    expect(Object.keys(AGENT_UI_LOCALE_METADATA).sort()).toEqual(Object.keys(AGENT_UI_LOCALES).sort());
    for (const locale of Object.keys(AGENT_UI_LOCALES) as (keyof typeof AGENT_UI_LOCALES)[]) {
      expect(Object.keys(AGENT_UI_LOCALES[locale]).sort()).toEqual([...namespaces].sort());
      expect(Object.values(AGENT_UI_LOCALES[locale]).every((group) =>
        Object.values(group).every((message) => typeof message === "string" && message.length > 0),
      )).toBe(true);
      expect(AGENT_UI_LOCALE_METADATA[locale].direction).toBe("ltr");
    }
  });

  it("admits feedback labels through its declared consumer scope", () => {
    const runtime = new PluginServiceRuntime();
    runtimes.push(runtime);
    runtime.reconcile(model, createPluginRegistry([localeProviderPlugin]), actions);
    function FeedbackLabelsProbe() {
      const labels = useAgentUILocale("conversationFeedback");
      return <span>{labels.helpful}</span>;
    }
    let renderer: ReactTestRenderer | undefined;
    act(() => { renderer = create(
      <PluginServiceRuntimeContext.Provider value={runtime}>
        <PluginServiceConsumerContext.Provider value={{
          pluginId: assistantUiFeedbackActionsPlugin.manifest.id, instanceId: "feedback-locale",
          provides: assistantUiFeedbackActionsPlugin.provides ?? [],
          inject: assistantUiFeedbackActionsPlugin.inject ?? [],
          optionalInject: assistantUiFeedbackActionsPlugin.optionalInject ?? [],
        }}><FeedbackLabelsProbe /></PluginServiceConsumerContext.Provider>
      </PluginServiceRuntimeContext.Provider>,
    ); });
    renderers.push(renderer!);
    expect(renderer!.toJSON()).toMatchObject({ children: [AGENT_UI_LOCALES["zh-CN"].conversationFeedback.helpful] });
    act(() => runtime.get<AgentUILocaleService>(AGENT_UI_LOCALE_SERVICE)!.setLocale("en-US"));
    expect(renderer!.toJSON()).toMatchObject({ children: ["Helpful"] });
  });

  it("updates stable snapshots and notifies only when locale changes", () => {
    const service = createAgentUILocaleService("zh-CN");
    const listener = vi.fn();
    const initial = service.getSnapshot();
    const unsubscribe = service.subscribe(listener);

    expect(initial).toEqual({ locale: "zh-CN", direction: "ltr" });
    service.setLocale("zh-CN");
    expect(service.getSnapshot()).toBe(initial);
    expect(listener).not.toHaveBeenCalled();

    service.setLocale("en-US");
    expect(service.getSnapshot()).toEqual({ locale: "en-US", direction: "ltr" });
    expect(service.getSnapshot()).not.toBe(initial);
    expect(listener).toHaveBeenCalledOnce();

    unsubscribe();
    service.setLocale("zh-CN");
    expect(listener).toHaveBeenCalledOnce();
  });

  it("provides the optional service and updates namespace consumers without reconciling the runtime", () => {
    const runtime = new PluginServiceRuntime();
    runtimes.push(runtime);
    runtime.reconcile(model, createPluginRegistry([localeProviderPlugin]), actions);
    const service = runtime.get<AgentUILocaleService>(AGENT_UI_LOCALE_SERVICE);
    expect(runtime.getActivation("locale-provider-main")?.status).toBe("active");
    expect(service).toBeDefined();

    const modelBefore = JSON.stringify(model);
    const activationBefore = runtime.getActivation("locale-provider-main");
    const theme = renderLocaleProbe(runtime, "theme");
    const threadList = renderLocaleProbe(runtime, "threadList");
    expect(theme.toJSON()).toMatchObject({ children: ["主题设置"] });
    expect(threadList.toJSON()).toMatchObject({ children: ["新建会话"] });

    act(() => service?.setLocale("en-US"));
    expect(theme.toJSON()).toMatchObject({ children: ["Theme settings"] });
    expect(threadList.toJSON()).toMatchObject({ children: ["New Thread"] });
    expect(runtime.get<AgentUILocaleService>(AGENT_UI_LOCALE_SERVICE)).toBe(service);
    expect(runtime.getActivation("locale-provider-main")).toBe(activationBefore);
    expect(JSON.stringify(model)).toBe(modelBefore);
  });

  it("uses the configured default when the provider is absent", () => {
    const runtime = new PluginServiceRuntime();
    runtimes.push(runtime);
    expect(runtime.get(AGENT_UI_LOCALE_SERVICE)).toBeUndefined();
    const theme = renderLocaleProbe(runtime, "theme");
    expect(agentUILocaleConfig.defaultLocale).toBe("zh-CN");
    expect(theme.toJSON()).toMatchObject({ children: ["主题设置"] });
  });

  it("does not recreate ConversationService or reset its active conversation", async () => {
    const dataSourceProvider: UIPluginDefinition = {
      manifest: {
        id: "locale-test-data-source",
        name: "Locale Test Data Source",
        description: "Provides an in-memory conversation for the locale test.",
        version: "1.0.0",
        capabilities: ["headless"],
      },
      provides: [AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE],
      setup: ({ services }) => {
        services.provide(AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE, {
          list: async () => [{ id: "saved", title: "Saved" }],
          get: async (id: string) => ({
            id,
            title: "Saved",
            history: { format: "langchain", messages: [] },
          }),
        });
      },
      Component: () => null,
    };
    const runtimeModel = parseAppUIRuntimeModel({
      root: { type: "slot", id: "stable-locale-root", slotId: "stable-locale-slot" },
      pluginInstances: {
        "data-source-main": {
          id: "data-source-main", pluginId: "locale-test-data-source", enabled: true,
        },
        "conversation-service-main": {
          id: "conversation-service-main", pluginId: "conversation-service", enabled: true,
        },
        "locale-provider-main": {
          id: "locale-provider-main", pluginId: "locale-provider", enabled: true,
        },
      },
    });
    const runtime = new PluginServiceRuntime();
    runtimes.push(runtime);
    runtime.reconcile(runtimeModel, createPluginRegistry([
      conversationServicePlugin,
      dataSourceProvider,
      localeProviderPlugin,
    ]), actions);
    const conversation = runtime.get<ConversationService>(AGENT_UI_CONVERSATION_SERVICE);
    const locale = runtime.get<AgentUILocaleService>(AGENT_UI_LOCALE_SERVICE);
    expect(conversation).toBeDefined();
    expect(locale).toBeDefined();
    await conversation?.selectConversation("saved");
    const conversationSnapshot = conversation?.getSnapshot();
    const activation = runtime.getActivation("conversation-service-main");

    locale?.setLocale("en-US");

    expect(runtime.get(AGENT_UI_CONVERSATION_SERVICE)).toBe(conversation);
    expect(runtime.getActivation("conversation-service-main")).toBe(activation);
    expect(conversation?.getSnapshot()).toBe(conversationSnapshot);
    expect(conversation?.getSnapshot().activeConversationId).toBe("saved");
    expect(conversation?.getSnapshot().mode).toBe("history");
  });

  it("keeps the provider in Application Foundation", () => {
    const appUIModel = parseAppUIModel(appUIJson);
    expect(appUIModel.applicationPlugins).toContainEqual({
      id: "locale-provider-main",
      pluginId: "locale-provider",
      enabled: true,
    });
  });
});
