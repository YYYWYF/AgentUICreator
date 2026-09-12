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
import type { UIPluginComponentProps } from "../framework/contracts/ui-plugin";

const renderFallback: UIPluginComponentProps["renderSlot"] = (
  _slotId,
  fallback,
) => fallback;

function createModel({
  items = [],
  welcome = {},
}: {
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
    },
  };
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
}: {
  chatModel: ChatModelAdapter;
  model: AppUIModel;
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
    <AssistantRuntimeProvider config={config} runtime={runtime}>
      <AssistantUiPresentationConfigProvider value={presentation}>
        <AssistantUiConversationAdapter renderSlot={renderFallback} />
      </AssistantUiPresentationConfigProvider>
    </AssistantRuntimeProvider>
  );
}

const mountedRenderers: ReactTestRenderer[] = [];

async function renderPresentation(
  model: AppUIModel,
  chatModel: ChatModelAdapter,
): Promise<ReactTestRenderer> {
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(<PresentationFixture chatModel={chatModel} model={model} />);
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
    });
  });

  it("renders and live-updates native Welcome and static Suggestions", async () => {
    const chatModel: ChatModelAdapter = {
      run: async () => ({ content: [] }),
    };
    const modelA = createModel({
      welcome: { title: "Welcome A", description: "Description A" },
      items: [{ label: "Suggestion A", description: "Details A" }],
    });
    const modelB = createModel({
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

    await act(async () => {
      renderer.update(<PresentationFixture chatModel={chatModel} model={modelB} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(renderedText(renderer)).not.toContain("Welcome A");
    expect(renderedText(renderer)).not.toContain("Suggestion A");
    expect(renderedText(renderer)).toContain("Welcome B");
    expect(renderedText(renderer)).toContain("Description B");
    expect(renderedText(renderer)).toContain("Suggestion B");
    expect(renderedText(renderer)).toContain("Details B");
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
