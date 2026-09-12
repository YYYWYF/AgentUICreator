// @vitest-environment jsdom

import {
  AssistantRuntimeProvider,
  AuiConfig,
  Suggestions,
  useLocalRuntime,
  type ChatModelAdapter,
} from "@assistant-ui/react";
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import appUIJson from "../app-ui/app-ui.json";
import {
  AssistantUiPresentationConfigProvider,
  resolveAssistantUiPresentationConfig,
} from "../agent-ui/adapters/assistant-ui/config";
import { AssistantUiConversationAdapter } from "../agent-ui/adapters/assistant-ui/conversation";
import {
  parseAppUIModel,
  type AppUIModel,
} from "../framework/contracts/app-ui-model";
import type {
  UIPluginComponentProps,
  UIPluginDefinition,
} from "../framework/contracts/ui-plugin";
import {
  createPluginRegistry,
  PluginServiceRuntime,
  PluginServiceRuntimeContext,
} from "../runtime/plugins";
import {
  AGENT_UI_CONVERSATION_SERVICE,
  EMPTY_CONVERSATION_SNAPSHOT,
  type AgentUIConversationService,
  type ConversationSnapshot,
} from "../services/conversations";

const renderFallback: UIPluginComponentProps["renderSlot"] = (
  _slotId,
  fallback,
) => fallback;

function createModel({
  composer = {},
  items = [],
  welcome = {},
}: {
  composer?: Record<string, unknown>;
  items?: unknown;
  welcome?: Record<string, unknown>;
} = {}): AppUIModel {
  return {
    version: "2",
    root: {
      type: "slot",
      id: "assistant-ui-presentation-test-root",
      slotId: "workspace.conversation",
    },
    pluginInstances: {
      "agent-welcome-main": {
        id: "agent-welcome-main",
        pluginId: "agent-thread-welcome",
        enabled: true,
        mount: { slotId: "conversation.empty.welcome" },
        props: welcome,
      },
      "agent-prompts-main": {
        id: "agent-prompts-main",
        pluginId: "agent-suggestions",
        enabled: true,
        mount: { slotId: "conversation.empty.suggestions" },
        props: { items },
      },
      "agent-sender-main": {
        id: "agent-sender-main",
        pluginId: "agent-composer",
        enabled: true,
        mount: { slotId: "conversation.composer" },
        props: composer,
      },
    },
  };
}

const runtimeActions = {
  sendMessage: async () => undefined,
  resumeInterrupts: async () => undefined,
  startNewConversation: async () => undefined,
  abortRun: () => undefined,
  updateInstanceProps: () => undefined,
};

function createConversationService(
  snapshot: ConversationSnapshot,
): AgentUIConversationService {
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    refresh: async () => undefined,
    selectConversation: async () => undefined,
    showLiveConversation: () => undefined,
    startNewConversation: async () => undefined,
  };
}

function createConversationServiceRuntime(
  snapshot: ConversationSnapshot,
): PluginServiceRuntime {
  const servicePlugin: UIPluginDefinition = {
    manifest: {
      id: "assistant-ui-presentation-conversation-service",
      name: "Assistant UI Presentation Conversation Service",
      description: "Test-only Conversation Service for presentation policy.",
      version: "1.0.0",
      capabilities: ["headless"],
    },
    provides: [AGENT_UI_CONVERSATION_SERVICE],
    setup: ({ services }) => {
      services.provide(
        AGENT_UI_CONVERSATION_SERVICE,
        createConversationService(snapshot),
      );
    },
    Component: () => null,
  };
  const serviceRuntime = new PluginServiceRuntime();
  serviceRuntime.reconcile(
    {
      version: "2",
      root: {
        type: "slot",
        id: "assistant-ui-presentation-service-root",
        slotId: "assistant-ui-presentation-service-root",
      },
      pluginInstances: {
        "assistant-ui-presentation-conversation-service-main": {
          id: "assistant-ui-presentation-conversation-service-main",
          pluginId: servicePlugin.manifest.id,
          enabled: true,
        },
      },
    },
    createPluginRegistry([servicePlugin]),
    runtimeActions,
  );
  return serviceRuntime;
}

function renderedText(renderer: ReactTestRenderer): string {
  const visit = (value: unknown): string => {
    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }
    if (Array.isArray(value)) return value.map(visit).join("");
    if (value !== null && typeof value === "object" && "children" in value) {
      return visit((value as { children?: unknown }).children);
    }
    return "";
  };
  return visit(renderer.toJSON());
}

function PresentationFixture({
  chatModel,
  model,
  serviceRuntime,
}: {
  chatModel: ChatModelAdapter;
  model: AppUIModel;
  serviceRuntime: PluginServiceRuntime;
}) {
  const runtime = useLocalRuntime(chatModel);
  const presentation = resolveAssistantUiPresentationConfig(model);
  const config = AuiConfig({
    suggestions: Suggestions(
      presentation.starterSuggestions.map(({ label, prompt, title }) => ({
        title,
        label: label ?? "",
        prompt,
      })),
    ),
  });

  return (
    <PluginServiceRuntimeContext.Provider value={serviceRuntime}>
      <AssistantRuntimeProvider config={config} runtime={runtime}>
        <AssistantUiPresentationConfigProvider value={presentation}>
          <AssistantUiConversationAdapter renderSlot={renderFallback} />
        </AssistantUiPresentationConfigProvider>
      </AssistantRuntimeProvider>
    </PluginServiceRuntimeContext.Provider>
  );
}

const mountedRenderers: ReactTestRenderer[] = [];
const serviceRuntimes: PluginServiceRuntime[] = [];

async function renderPresentation(
  model: AppUIModel,
  chatModel: ChatModelAdapter,
  conversationSnapshot: ConversationSnapshot = EMPTY_CONVERSATION_SNAPSHOT,
): Promise<ReactTestRenderer> {
  const serviceRuntime = createConversationServiceRuntime(conversationSnapshot);
  serviceRuntimes.push(serviceRuntime);
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(
      <PresentationFixture
        chatModel={chatModel}
        model={model}
        serviceRuntime={serviceRuntime}
      />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  if (renderer === undefined) throw new Error("Presentation renderer was not created.");
  mountedRenderers.push(renderer);
  return renderer;
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(async () => {
  await act(async () => {
    for (const renderer of mountedRenderers.splice(0)) renderer.unmount();
  });
  for (const serviceRuntime of serviceRuntimes.splice(0)) {
    serviceRuntime.dispose();
  }
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("assistant-ui presentation config", () => {
  it("maps Welcome and starter suggestion product data without legacy parsers", () => {
    const model = createModel({
      welcome: {
        title: "Agent Frontend",
        description: "Canonical assistant-ui presentation",
      },
      items: [
        {
          key: "summary",
          label: "总结当前上下文",
          description: "提炼目标、约束与下一步",
        },
        {
          label: "显式提示",
          description: "发送不同的内容",
          prompt: "请详细说明",
        },
        "字符串建议",
        { label: "   " },
        null,
        42,
      ],
    });

    expect(resolveAssistantUiPresentationConfig(model)).toEqual({
      welcome: {
        title: "Agent Frontend",
        description: "Canonical assistant-ui presentation",
      },
      starterSuggestions: [
        {
          title: "总结当前上下文",
          label: "提炼目标、约束与下一步",
          prompt: "总结当前上下文",
        },
        {
          title: "显式提示",
          label: "发送不同的内容",
          prompt: "请详细说明",
        },
        {
          title: "字符串建议",
          prompt: "字符串建议",
        },
      ],
      composer: { quickPrompts: [] },
    });
  });

  it("maps Composer placeholder and quick prompts without legacy defaults", () => {
    const model = createModel({
      composer: {
        placeholder: " Composer placeholder ",
        suggestions: [
          "字符串快捷项",
          {
            id: "explicit-id",
            key: "ignored-key",
            label: "显式 ID",
            value: "显式提示文本",
            description: "显式说明",
          },
          {
            key: "key-fallback",
            label: "Key fallback",
            value: "Key prompt",
          },
          {
            label: "Index fallback",
            value: "Index prompt",
          },
          { label: "Missing value" },
          null,
          42,
        ],
      },
    });

    expect(resolveAssistantUiPresentationConfig(model).composer).toEqual({
      placeholder: " Composer placeholder ",
      quickPrompts: [
        {
          id: "suggestion-0",
          label: "字符串快捷项",
          value: "字符串快捷项",
        },
        {
          id: "explicit-id",
          label: "显式 ID",
          value: "显式提示文本",
          description: "显式说明",
        },
        {
          id: "key-fallback",
          label: "Key fallback",
          value: "Key prompt",
        },
        {
          id: "suggestion-3",
          label: "Index fallback",
          value: "Index prompt",
        },
      ],
    });
  });

  it("returns empty adapter data for missing or invalid product props", () => {
    const model = createModel({
      welcome: { title: " ", description: false },
      items: { label: "not-an-array" },
    });

    expect(resolveAssistantUiPresentationConfig(model)).toEqual({
      welcome: {},
      starterSuggestions: [],
      composer: { quickPrompts: [] },
    });
  });

  it("renders and live-updates native Welcome and static Suggestions", async () => {
    const chatModel: ChatModelAdapter = {
      run: async () => ({ content: [] }),
    };
    const modelA = createModel({
      composer: { placeholder: "Composer A" },
      welcome: { title: "Welcome A", description: "Description A" },
      items: [{ label: "Suggestion A", description: "Details A" }],
    });
    const modelB = createModel({
      composer: { placeholder: "Composer B" },
      welcome: { title: "Welcome B", description: "Description B" },
      items: [{ label: "Suggestion B", description: "Details B" }],
    });
    const renderer = await renderPresentation(modelA, chatModel);

    expect(renderedText(renderer)).toContain("Welcome A");
    expect(renderedText(renderer)).toContain("Description A");
    expect(renderedText(renderer)).toContain("Suggestion A");
    expect(renderedText(renderer)).toContain("Details A");
    expect(
      renderer.root.findAll((node) =>
        typeof node.props.className === "string" &&
        node.props.className.split(/\s+/u).includes("aui-thread-welcome-root"),
      ),
    ).toHaveLength(1);
    expect(
      renderer.root.findAllByProps({ "data-ui-plugin": "agent-thread-welcome" }),
    ).toHaveLength(0);
    expect(
      renderer.root.findAllByProps({ "data-ui-plugin": "agent-suggestions" }),
    ).toHaveLength(0);
    expect(renderer.root.findByType("textarea").props.placeholder).toBe(
      "Composer A",
    );

    await act(async () => {
      renderer.update(
        <PresentationFixture
          chatModel={chatModel}
          model={modelB}
          serviceRuntime={serviceRuntimes[0]!}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(renderedText(renderer)).not.toContain("Welcome A");
    expect(renderedText(renderer)).not.toContain("Suggestion A");
    expect(renderedText(renderer)).toContain("Welcome B");
    expect(renderedText(renderer)).toContain("Description B");
    expect(renderedText(renderer)).toContain("Suggestion B");
    expect(renderedText(renderer)).toContain("Details B");
    expect(renderer.root.findByType("textarea").props.placeholder).toBe(
      "Composer B",
    );
  });

  it("renders the current AppUIModel empty state through assistant-ui primitives", async () => {
    const chatModel: ChatModelAdapter = {
      run: async () => ({ content: [] }),
    };
    const renderer = await renderPresentation(
      parseAppUIModel(appUIJson),
      chatModel,
    );
    const text = renderedText(renderer);

    expect(text).toContain("Agent Frontend");
    expect(text).toContain(
      "通过 AG-UI 与一个 Agent Runtime 连接，由可复用 UI Plugin 确定性渲染。",
    );
    expect(text).toContain("总结当前上下文");
    expect(text).toContain("解释界面结构");
    expect(text).toContain("建议下一步");
    expect(text).toContain("提炼目标、约束与下一步");
    expect(text).toContain("说明 AppUIModel 与插件的关系");
    expect(text).toContain("给出一个可执行的后续动作");
    expect(
      renderer.root.findAllByProps({ "data-ui-plugin": "agent-composer" }),
    ).toHaveLength(0);
    const composerInput = renderer.root.findAll((node) =>
      node.type === "textarea" &&
      typeof node.props.className === "string" &&
      node.props.className.split(/\s+/u).includes("aui-composer-input"),
    );
    expect(composerInput).toHaveLength(1);
    expect(composerInput[0]!.props.placeholder).toBe(
      "给智能体发送消息，输入 / 唤出快捷指令",
    );

    const composer = resolveAssistantUiPresentationConfig(
      parseAppUIModel(appUIJson),
    ).composer;
    expect(composer.quickPrompts).toEqual([
      {
        id: "summarize-current",
        label: "总结当前会话",
        value: "请总结当前会话，并列出下一步。",
        description: "提炼目标、约束和下一步",
      },
      {
        id: "explain-last-tool",
        label: "解释最近一次工具调用",
        value: "请解释最近一次工具调用的输入、输出和结论。",
        description: "查看输入、输出和结论",
      },
    ]);
  });

  it("makes the native Composer read-only in history mode", async () => {
    const renderer = await renderPresentation(
      createModel({
        composer: {
          placeholder: "Live placeholder",
          suggestions: [{ label: "Command", value: "Prompt" }],
        },
      }),
      { run: async () => ({ content: [] }) },
      {
        ...EMPTY_CONVERSATION_SNAPSHOT,
        mode: "history",
        activeConversationId: "history",
        detailStatus: "ready",
      },
    );
    const input = renderer.root.findAll((node) =>
      node.type === "textarea" &&
      typeof node.props.className === "string" &&
      node.props.className.split(/\s+/u).includes("aui-composer-input"),
    );

    expect(input).toHaveLength(1);
    expect(input[0]!.props.disabled).toBe(true);
    expect(input[0]!.props.placeholder).toBe(
      "历史会话为只读，请返回当前会话或新建会话",
    );
    for (const actionClass of [
      "aui-composer-send",
      "aui-composer-cancel",
      "aui-composer-dictate",
      "aui-composer-add-attachment",
    ]) {
      expect(renderer.root.findAll((node) =>
        typeof node.props.className === "string" &&
        node.props.className.split(/\s+/u).includes(actionClass),
      )).toHaveLength(0);
    }
    expect(
      renderer.root.findAllByProps({ "data-slot": "composer-trigger-popover" }),
    ).toHaveLength(0);
  });

  it("inserts a slash quick prompt without sending, then uses one native send owner", async () => {
    const run = vi.fn(async () => ({ content: [] }));
    const renderer = await renderPresentation(
      createModel({
        composer: {
          suggestions: [{
            id: "summarize",
            label: "总结当前会话",
            value: "请总结当前会话，并列出下一步。",
            description: "提炼目标、约束和下一步",
          }],
        },
      }),
      { run },
    );
    const findInput = (): ReactTestInstance => renderer.root.find((node) =>
      node.type === "textarea" &&
      typeof node.props.className === "string" &&
      node.props.className.split(/\s+/u).includes("aui-composer-input"),
    );

    await act(async () => {
      findInput().props.onChange({
        target: { value: "/", selectionStart: 1 },
        nativeEvent: { isComposing: false },
      });
      await Promise.resolve();
    });
    const promptItems = renderer.root.findAll((node) =>
      node.type === "button" && node.props.role === "option",
    );
    expect(promptItems).toHaveLength(1);

    await act(async () => {
      promptItems[0]!.props.onClick({ defaultPrevented: false });
      await Promise.resolve();
    });
    expect(findInput().props.value).toBe("请总结当前会话，并列出下一步。 ");
    expect(run).not.toHaveBeenCalled();

    const form = renderer.root.find((node) =>
      node.type === "form" &&
      typeof node.props.className === "string" &&
      node.props.className.split(/\s+/u).includes("aui-composer-root"),
    );
    await act(async () => {
      form.props.onSubmit({
        defaultPrevented: false,
        preventDefault: () => undefined,
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("sends a native starter suggestion exactly once", async () => {
    const run = vi.fn(async () => ({ content: [] }));
    const chatModel: ChatModelAdapter = { run };
    const renderer = await renderPresentation(
      createModel({ items: [{ label: "总结当前上下文" }] }),
      chatModel,
    );
    const suggestionButtons = renderer.root.findAll((node) =>
      node.type === "button" &&
      typeof node.props.className === "string" &&
      node.props.className.split(/\s+/u).includes("aui-thread-welcome-suggestion"),
    );
    expect(suggestionButtons).toHaveLength(1);

    await act(async () => {
      suggestionButtons[0]!.props.onClick({
        defaultPrevented: false,
        nativeEvent: new MouseEvent("click"),
        preventDefault: () => undefined,
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(run).toHaveBeenCalledTimes(1);
  });
});
