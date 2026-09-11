// @vitest-environment jsdom

import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentSuggestion } from "../agent-ui/components/suggestions";
import { AgentUIRootContext } from "../agent-ui/foundation/context";
import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import type {
  AgentInterrupt,
  AgentRunState,
} from "../framework/contracts/ui-plugin";
import { agentSuggestionsPlugin } from "../plugins/agent-suggestions/definition";
import {
  createPluginRegistry,
  PluginServiceRuntime,
  PluginServiceRuntimeContext,
} from "../runtime/plugins";
import { PluginRuntimeFixture } from "./agent-runtime-fixture";

const idleRun: AgentRunState = { status: "idle" };

function createSuggestionsModel(props?: Record<string, unknown>) {
  return parseAppUIModel({
    version: "2",
    root: {
      type: "slot",
      id: "suggestions-node",
      slotId: "conversation.empty.suggestions",
    },
    pluginInstances: {
      "agent-prompts-main": {
        id: "agent-prompts-main",
        pluginId: "agent-suggestions",
        enabled: true,
        mount: { slotId: "conversation.empty.suggestions" },
        ...(props === undefined ? {} : { props }),
      },
    },
  });
}

interface MountedSuggestions {
  renderer: ReactTestRenderer;
  sendMessage: ReturnType<typeof vi.fn>;
  dispose(): Promise<void>;
}

const mounted: MountedSuggestions[] = [];

async function mountSuggestions({
  props,
  run = idleRun,
  interrupts = [],
}: {
  props?: Record<string, unknown>;
  run?: AgentRunState;
  interrupts?: AgentInterrupt[];
} = {}): Promise<MountedSuggestions> {
  const model = createSuggestionsModel(props);
  const registry = createPluginRegistry([agentSuggestionsPlugin]);
  const serviceRuntime = new PluginServiceRuntime();
  const sendMessage = vi.fn(async () => undefined);
  const actions = {
    sendMessage,
    resumeInterrupts: async () => undefined,
    startNewConversation: async () => undefined,
    abortRun: () => undefined,
    updateInstanceProps: () => undefined,
  };
  serviceRuntime.reconcile(model, registry, actions);
  let renderer: ReactTestRenderer | undefined;

  await act(async () => {
    renderer = create(
      <AgentUIRootContext.Provider value={{ portalContainer: null }}>
        <PluginServiceRuntimeContext.Provider value={serviceRuntime}>
          <PluginRuntimeFixture
            actions={actions}
            conversation={{ id: "live" }}
            executions={[]}
            interrupts={[...interrupts]}
            messages={[]}
            model={model}
            registry={registry}
            run={run}
            state={{}}
          />
        </PluginServiceRuntimeContext.Provider>
      </AgentUIRootContext.Provider>,
    );
  });

  if (renderer === undefined) {
    serviceRuntime.dispose();
    throw new Error("Suggestions renderer was not created");
  }

  const result: MountedSuggestions = {
    renderer,
    sendMessage,
    dispose: async () => {
      await act(async () => renderer?.unmount());
      serviceRuntime.dispose();
    },
  };
  mounted.push(result);
  return result;
}

function textContent(node: ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : textContent(child)))
    .join("");
}

function suggestionTitles(renderer: ReactTestRenderer): string[] {
  return renderer.root.findAllByType(AgentSuggestion).map((node) =>
    textContent(
      node.findByProps({ "data-slot": "agent-suggestion-title" }),
    ),
  );
}

afterEach(async () => {
  for (const entry of mounted.splice(0)) await entry.dispose();
});

describe("agent-suggestions runtime binding", () => {
  it("maps configured items and instance title", async () => {
    const suggestions = await mountSuggestions({
      props: {
        title: "配置标题",
        items: [
          { key: "one", label: "第一条", description: "说明一" },
          { label: "第二条" },
        ],
      },
    });

    expect(
      suggestions.renderer.root.findByProps({
        "data-slot": "agent-suggestions-title",
      }),
    ).toBeDefined();
    expect(textContent(suggestions.renderer.root)).toContain("配置标题");
    expect(suggestionTitles(suggestions.renderer)).toEqual(["第一条", "第二条"]);
    expect(textContent(suggestions.renderer.root)).toContain("说明一");
  });

  it("accepts string items without changing the configuration contract", async () => {
    const suggestions = await mountSuggestions({
      props: { items: ["总结当前上下文", "解释当前界面结构"] },
    });
    expect(suggestionTitles(suggestions.renderer)).toEqual([
      "总结当前上下文",
      "解释当前界面结构",
    ]);
  });

  it("falls back to the default suggestions", async () => {
    const suggestions = await mountSuggestions();
    expect(suggestionTitles(suggestions.renderer)).toEqual([
      "总结当前上下文",
      "解释当前界面结构",
      "建议下一步",
    ]);
  });

  it("safely ignores malformed items", async () => {
    const suggestions = await mountSuggestions({
      props: {
        items: [
          "有效字符串",
          { key: "no-label" },
          { label: "" },
          null,
          42,
          { label: "有效对象", description: "说明" },
        ],
      },
    });
    expect(suggestionTitles(suggestions.renderer)).toEqual([
      "有效字符串",
      "有效对象",
    ]);
  });

  it("sends the suggestion text through the plugin adapter", async () => {
    const suggestions = await mountSuggestions({
      props: { items: [{ key: "summarize", label: "总结当前上下文" }] },
    });
    const item = suggestions.renderer.root.findByType(AgentSuggestion);
    await act(async () => {
      item.props.onSelect();
      await Promise.resolve();
    });
    expect(suggestions.sendMessage).toHaveBeenCalledWith("总结当前上下文");
  });

  it("disables every suggestion while the run is running", async () => {
    const suggestions = await mountSuggestions({
      run: { status: "running" },
      props: { items: [{ label: "总结当前上下文" }, { label: "建议下一步" }] },
    });
    const items = suggestions.renderer.root.findAllByType(AgentSuggestion);
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.props.disabled).toBe(true);
    }
  });

  it("disables every suggestion while interrupts are pending", async () => {
    const suggestions = await mountSuggestions({
      interrupts: [
        {
          id: "interrupt-1",
          producer: { type: "root" },
          reason: "approval",
          message: "需要确认",
        },
      ],
      props: { items: [{ label: "总结当前上下文" }] },
    });
    const item = suggestions.renderer.root.findByType(AgentSuggestion);
    expect(item.props.disabled).toBe(true);
  });

  it("does not send while disabled", async () => {
    const suggestions = await mountSuggestions({
      run: { status: "running" },
      props: { items: [{ label: "总结当前上下文" }] },
    });
    const item = suggestions.renderer.root.findByType(AgentSuggestion);
    await act(async () => {
      item.props.onSelect();
      await Promise.resolve();
    });
    expect(suggestions.sendMessage).not.toHaveBeenCalled();
  });

  it("keeps sendMessage out of the presentation component", async () => {
    const suggestions = await mountSuggestions({
      props: { items: [{ label: "总结当前上下文" }] },
    });
    const item = suggestions.renderer.root.findByType(AgentSuggestion);
    expect(item.props).not.toHaveProperty("sendMessage");
    expect(item.props.onSelect).toBeTypeOf("function");
  });
});

describe("agent-suggestions policy", () => {
  it("keeps the plugin independent of Ant Design", async () => {
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const projectRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    );
    for (const fileName of ["index.tsx", "definition.ts", "styles.css", "manifest.json"]) {
      const source = await readFile(
        path.join(projectRoot, "plugins/agent-suggestions", fileName),
        "utf8",
      );
      expect(source, fileName).not.toMatch(
        /@ant-design\/x|@ant-design\/icons|from\s*["']antd["']|\.ant-/u,
      );
    }
    const css = await readFile(
      path.join(projectRoot, "plugins/agent-suggestions/styles.css"),
      "utf8",
    );
    expect(css).not.toMatch(/#[0-9a-fA-F]|\b(?:rgb|rgba|hsl|hsla|oklch)\s*\(/u);
    expect(css).not.toMatch(/(?:linear|radial)-gradient\s*\(/u);
    expect(css).not.toMatch(/\.ant-|development-preview|--ui-/u);
    expect(css).toMatch(/var\(--aui-/u);
  });

  it("binds sendMessage only through the plugin adapter", async () => {
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const projectRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    );
    const indexSource = await readFile(
      path.join(projectRoot, "plugins/agent-suggestions/index.tsx"),
      "utf8",
    );
    expect(indexSource).toContain(
      'from "../../agent-ui/components/suggestions"',
    );
    expect(indexSource).toMatch(/<AgentSuggestions\b/u);
    expect(indexSource).toMatch(/<AgentSuggestion\b/u);
    expect(indexSource).toMatch(/actions\.sendMessage\(/u);
    expect(indexSource).not.toMatch(/@ant-design/u);
  });

  it("keeps the manifest canonical", async () => {
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const projectRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    );
    const manifest = JSON.parse(
      await readFile(
        path.join(projectRoot, "plugins/agent-suggestions/manifest.json"),
        "utf8",
      ),
    ) as { id: string; version: string; capabilities: string[] };
    expect(manifest).toMatchObject({
      id: "agent-suggestions",
      version: "1.0.0",
      capabilities: ["message-suggestions", "message-send"],
    });
  });
});
