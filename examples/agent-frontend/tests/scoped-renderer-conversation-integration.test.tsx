// @vitest-environment jsdom

import { useEffect } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  AssistantRuntimeProvider,
  AuiConfig,
  Tools,
  useLocalRuntime,
  type AssistantRuntime,
  type ChatModelAdapter,
  type ThreadMessage,
} from "@assistant-ui/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConversationAdapter } from "../agent-ui/conversation/ConversationAdapter";
import { createConversationToolkit } from "../agent-ui/conversation/toolkit";
import {
  parseAppUIRuntimeModel,
  type AppUIRuntimeModel,
} from "../framework/contracts/app-ui-runtime-model";
import type { UIPluginComponentProps, UIPluginDefinition, UIPluginRenderScope } from "../framework/contracts/ui-plugin";
import { AssistantUiReasoningPlugin } from "../plugins/assistant-ui-reasoning";
import { AssistantUiToolFallbackPlugin } from "../plugins/assistant-ui-tool-fallback";
import { AssistantUiToolGroupPlugin } from "../plugins/assistant-ui-tool-group";
import { SubagentConversationPlugin } from "../plugins/subagent-conversation";
import {
  createPluginRegistry,
  type RuntimeDiagnostic,
  usePluginRenderScope,
} from "../runtime/plugins";
import { PluginRuntimeFixture } from "./agent-runtime-fixture";

const roots: Root[] = [];
const fallbackInvocations = vi.fn();
const reasoningScopes = vi.fn((_scope: UIPluginRenderScope<{ group: { indices: readonly number[]; status: { type: string } }; children: unknown }> | null) => undefined);
let hostMounts = 0;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverMock);
Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: () => undefined });

function Host({ renderScopedSlot }: UIPluginComponentProps) {
  useEffect(() => { hostMounts += 1; }, []);
  return <ConversationAdapter renderScopedSlot={renderScopedSlot} />;
}

const definitions: UIPluginDefinition[] = [
  {
    manifest: {
      id: "conversation-test-host", name: "Conversation test host", description: "Conversation integration host", version: "1.0.0",
      slots: { children: {
        reasoningGroup: { description: "Reasoning renderer", cardinality: "one", mode: "renderer", optional: true,
          accepts: { anyOfCapabilities: ["conversation-reasoning-renderer"] } },
        toolGroup: { description: "Tool group renderer", cardinality: "one", mode: "renderer", optional: true,
          accepts: { anyOfCapabilities: ["conversation-tool-group-renderer"] } },
        toolFallback: { description: "Tool fallback renderer", cardinality: "one", mode: "renderer", optional: true,
          accepts: { anyOfCapabilities: ["conversation-tool-fallback-renderer"] } },
        subagentConversation: { description: "Subagent conversation renderer", cardinality: "one", mode: "renderer", optional: true,
          accepts: { anyOfCapabilities: ["conversation-subagent-renderer"] } },
      } },
    },
    Component: Host,
  },
  {
    manifest: { id: "reasoning-test", name: "Reasoning", description: "Reasoning renderer", version: "1.0.0",
      capabilities: ["conversation-reasoning-renderer"], requiresRenderScope: true },
    Component: (props) => {
      const scope = usePluginRenderScope<{ group: { indices: readonly number[]; status: { type: string } }; children: unknown }>();
      reasoningScopes(scope);
      return <AssistantUiReasoningPlugin {...props} />;
    },
  },
  {
    manifest: { id: "tool-group-test", name: "Tool group", description: "Tool group renderer", version: "1.0.0",
      capabilities: ["conversation-tool-group-renderer"], requiresRenderScope: true },
    Component: AssistantUiToolGroupPlugin,
  },
  {
    manifest: { id: "tool-fallback-test", name: "Tool fallback", description: "Tool fallback renderer", version: "1.0.0",
      capabilities: ["conversation-tool-fallback-renderer"], requiresRenderScope: true },
    Component: (props) => {
      fallbackInvocations();
      return <AssistantUiToolFallbackPlugin {...props} />;
    },
  },
  {
    manifest: { id: "subagent-conversation-test", name: "Subagent conversation", description: "Subagent conversation renderer", version: "1.0.0",
      capabilities: ["conversation-subagent-renderer"], requiresRenderScope: true },
    Component: SubagentConversationPlugin,
  },
];
const registry = createPluginRegistry(definitions);
const APP_UI_MODEL_HASH = "a".repeat(64);

function createModel(options: {
  reasoning?: "enabled" | "disabled" | "removed";
  toolGroup?: boolean;
  toolFallback?: boolean;
  subagentConversation?: boolean;
} = {}): AppUIRuntimeModel {
  const reasoning = options.reasoning ?? "enabled";
  return parseAppUIRuntimeModel({
    root: { type: "slot", id: "root", slotId: "root-slot" },
    pluginInstances: {
      host: { id: "host", pluginId: "conversation-test-host", enabled: true, mount: { slotId: "root-slot" } },
      ...(reasoning === "removed" ? {} : {
        reasoning: { id: "reasoning", pluginId: "reasoning-test", enabled: reasoning === "enabled",
          mount: { slotId: "plugin:host:reasoningGroup" } },
      }),
      ...(options.toolGroup === false ? {} : {
        toolGroup: { id: "toolGroup", pluginId: "tool-group-test", enabled: true,
          mount: { slotId: "plugin:host:toolGroup" } },
      }),
      ...(options.toolFallback === false ? {} : {
        fallback: { id: "fallback", pluginId: "tool-fallback-test", enabled: true,
          mount: { slotId: "plugin:host:toolFallback" } },
      }),
      ...(options.subagentConversation === false ? {} : {
        subagentConversation: { id: "subagentConversation", pluginId: "subagent-conversation-test", enabled: true,
          mount: { slotId: "plugin:host:subagentConversation" } },
      }),
    },
  });
}
const actions = {
  sendMessage: async () => undefined,
  resumeInterrupts: async () => undefined,
  startNewConversation: async () => undefined,
  abortRun: () => undefined,
};
const config = AuiConfig({ tools: Tools({ toolkit: createConversationToolkit() }) });

function RuntimeFixture({ chatModel, initialMessages, model, onRuntime, onRuntimeDiagnostic }: {
  chatModel: ChatModelAdapter;
  initialMessages: ThreadMessage[];
  model: AppUIRuntimeModel;
  onRuntime(runtime: AssistantRuntime): void;
  onRuntimeDiagnostic?(diagnostic: RuntimeDiagnostic): void;
}) {
  const runtime = useLocalRuntime(chatModel, { initialMessages: initialMessages as never });
  useEffect(() => onRuntime(runtime), [onRuntime, runtime]);
  return <AssistantRuntimeProvider config={config} runtime={runtime}>
    <PluginRuntimeFixture actions={actions} appUIModelHash={APP_UI_MODEL_HASH}
      conversation={{ id: "conversation-test" }} executions={[]}
      interrupts={[]} messages={[]} model={model} onRuntimeDiagnostic={onRuntimeDiagnostic}
      registry={registry} run={{ status: "idle" }} state={null} />
  </AssistantRuntimeProvider>;
}

function message(content: Extract<ThreadMessage, { role: "assistant" }>["content"], status: Extract<ThreadMessage, { role: "assistant" }>["status"] = { type: "complete", reason: "stop" }): ThreadMessage {
  return { id: "assistant-1", role: "assistant", content, status, createdAt: new Date(0), metadata: {
    unstable_state: null, unstable_annotations: [], unstable_data: [], steps: [], custom: {},
  } };
}

async function mount(
  initialMessages: ThreadMessage[],
  chatModel: ChatModelAdapter = { run: async () => ({ content: [] }) },
  model: AppUIRuntimeModel = createModel(),
  onRuntimeDiagnostic?: (diagnostic: RuntimeDiagnostic) => void,
) {
  let runtime: AssistantRuntime | undefined;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(<RuntimeFixture chatModel={chatModel} initialMessages={initialMessages} model={model}
      onRuntime={(value) => { runtime = value; }} onRuntimeDiagnostic={onRuntimeDiagnostic} />);
    await Promise.resolve();
  });
  if (runtime === undefined) throw new Error("Assistant runtime was not captured");
  return { container, root, runtime };
}

afterEach(async () => {
  await act(async () => { for (const root of roots.splice(0)) root.unmount(); });
  document.body.replaceChildren();
  fallbackInvocations.mockClear();
  reasoningScopes.mockClear();
  hostMounts = 0;
});

describe("Conversation scoped renderer integration", () => {
  it("renders unknown tools through the mounted fallback Plugin as running and complete", async () => {
    const tool = { type: "tool-call" as const, toolCallId: "unknown-1", toolName: "unknown_tool",
      args: { query: "hello" }, argsText: '{"query":"hello"}' };
    const { container, runtime } = await mount([message([tool], { type: "running" })]);
    expect(container.querySelector('[data-slot="tool-fallback-root"]')).not.toBeNull();
    expect(fallbackInvocations).toHaveBeenCalled();

    await act(async () => runtime.thread.reset([message([{ ...tool, result: { ok: true } }])]));
    expect(container.querySelector('[data-slot="tool-fallback-root"]')).not.toBeNull();
    expect(fallbackInvocations.mock.calls.length).toBeGreaterThan(1);
    expect(hostMounts).toBe(1);
  });

  it("lets the named search_files Tool UI take precedence over the fallback Plugin", async () => {
    const { container } = await mount([message([{ type: "tool-call", toolCallId: "search-1", toolName: "search_files",
      args: { keyword: "AG-UI" }, argsText: '{"keyword":"AG-UI"}', result: { files: ["src/App.tsx"] } }])]);
    expect(container.querySelector('[data-slot="tool-call"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="tool-fallback-root"]')).toBeNull();
    expect(fallbackInvocations).not.toHaveBeenCalled();
  });

  it("routes nested tool messages to the generic renderer and falls back when it is disabled", async () => {
    const nestedTool: Extract<ThreadMessage["content"][number], { type: "tool-call" }> = {
      type: "tool-call",
      toolCallId: "nested-1",
      toolName: "customer_defined_agent_tool",
      args: { task: "inspect" },
      argsText: '{"task":"inspect"}',
      messages: [message([{ type: "text", text: "Nested result" }])],
    };
    const { container, root } = await mount([message([nestedTool])]);
    expect(container.querySelector('[data-slot="tool-fallback-root"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="subagent-conversation-content"]')?.textContent)
      .toContain("Nested result");

    await act(async () => {
      root.render(<RuntimeFixture chatModel={{ run: async () => ({ content: [] }) }}
        initialMessages={[message([nestedTool])]} model={createModel({ subagentConversation: false })}
        onRuntime={() => undefined} />);
      await Promise.resolve();
    });
    expect(container.querySelector('[data-slot="subagent-conversation-content"]')).toBeNull();
    expect(container.querySelector('[data-slot="tool-fallback-root"]')).not.toBeNull();
  });

  it("passes one assistant-ui grouped reasoning scope for two parts and preserves the host", async () => {
    const content = [
      { type: "reasoning" as const, text: "First", status: { type: "running" as const } },
      { type: "reasoning" as const, text: "Second", status: { type: "running" as const } },
      { type: "text" as const, text: "Answer" },
    ];
    const { container, runtime } = await mount([message(content, { type: "running" })]);
    expect(reasoningScopes.mock.calls.length).toBeGreaterThan(0);
    expect(reasoningScopes.mock.calls.at(-1)?.[0]).toMatchObject({
      kind: "conversation.reasoning-group", value: { group: { indices: [0, 1], status: { type: "running" } } },
    });
    expect(reasoningScopes.mock.calls.at(-1)?.[0]?.value.children).toBeDefined();
    expect(container.textContent).toContain("Answer");
    await act(async () => runtime.thread.reset([message([
      { type: "reasoning", text: "First", status: { type: "complete" } },
      { type: "reasoning", text: "Second", status: { type: "complete" } },
      { type: "text", text: "Answer" },
    ])]));
    expect(reasoningScopes.mock.calls.at(-1)?.[0]).toMatchObject({
      value: { group: { indices: [0, 1], status: { type: "complete" } } },
    });
    expect(hostMounts).toBe(1);
  });

  it("does not report a plugin-render error when its Renderer occupant is disabled", async () => {
    const diagnostics: RuntimeDiagnostic[] = [];
    const reportDiagnostic = (diagnostic: RuntimeDiagnostic) => diagnostics.push(diagnostic);
    const content = [
      { type: "reasoning" as const, text: "Thinking", status: { type: "complete" as const } },
      { type: "text" as const, text: "Answer" },
    ];
    const { container, root } = await mount([message(content)], undefined, undefined, reportDiagnostic);
    expect(container.querySelector('[data-slot="reasoning-root"]')).not.toBeNull();
    expect(container.textContent).toContain("Answer");

    await act(async () => {
      root.render(<RuntimeFixture chatModel={{ run: async () => ({ content: [] }) }}
        initialMessages={[message(content)]} model={createModel({ reasoning: "disabled" })}
        onRuntime={() => undefined} onRuntimeDiagnostic={reportDiagnostic} />);
      await Promise.resolve();
    });
    expect(container.querySelector('[data-slot="reasoning-root"]')).toBeNull();
    expect(container.textContent).toContain("Answer");
    expect(diagnostics.filter((diagnostic) => diagnostic.status === "error")).toHaveLength(0);
    expect(diagnostics.some((diagnostic) =>
      diagnostic.errorMessage === 'Renderer Plugin instance "reasoning" is disabled.',
    )).toBe(false);
  });

  it("does not report a plugin-render error when its Renderer occupant is removed", async () => {
    const diagnostics: RuntimeDiagnostic[] = [];
    const reportDiagnostic = (diagnostic: RuntimeDiagnostic) => diagnostics.push(diagnostic);
    const content = [
      { type: "reasoning" as const, text: "Thinking", status: { type: "complete" as const } },
      { type: "text" as const, text: "Answer" },
    ];
    const { container, root } = await mount([message(content)], undefined, undefined, reportDiagnostic);
    expect(container.querySelector('[data-slot="reasoning-root"]')).not.toBeNull();
    expect(container.textContent).toContain("Answer");

    await act(async () => {
      root.render(<RuntimeFixture chatModel={{ run: async () => ({ content: [] }) }}
        initialMessages={[message(content)]} model={createModel({ reasoning: "removed" })}
        onRuntime={() => undefined} onRuntimeDiagnostic={reportDiagnostic} />);
      await Promise.resolve();
    });
    expect(container.querySelector('[data-slot="reasoning-root"]')).toBeNull();
    expect(container.textContent).toContain("Answer");
    expect(diagnostics.filter((diagnostic) => diagnostic.status === "error")).toHaveLength(0);
  });

  it("removes the ToolFallback presentation without affecting named Tool UI", async () => {
    const unknownTool = { type: "tool-call" as const, toolCallId: "unknown-2", toolName: "unknown_tool",
      args: { query: "hello" }, argsText: '{"query":"hello"}' };
    const namedTool = { type: "tool-call" as const, toolCallId: "search-2", toolName: "search_files",
      args: { keyword: "AG-UI" }, argsText: '{"keyword":"AG-UI"}', result: { files: ["src/App.tsx"] } };
    const { container, root, runtime } = await mount([message([unknownTool])]);
    expect(container.querySelector('[data-slot="tool-fallback-root"]')).not.toBeNull();

    await act(async () => {
      root.render(<RuntimeFixture chatModel={{ run: async () => ({ content: [] }) }}
        initialMessages={[message([unknownTool])]} model={createModel({ toolFallback: false })}
        onRuntime={() => undefined} />);
      await Promise.resolve();
    });
    expect(container.querySelector('[data-slot="tool-fallback-root"]')).toBeNull();

    await act(async () => runtime.thread.reset([message([namedTool])]));
    expect(container.querySelector('[data-slot="tool-call"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="tool-fallback-root"]')).toBeNull();
  });

  it("removes the entire grouped tool presentation when ToolGroup has no occupant", async () => {
    const unknownTool = { type: "tool-call" as const, toolCallId: "unknown-3", toolName: "unknown_tool",
      args: { query: "hello" }, argsText: '{"query":"hello"}' };
    const namedTool = { type: "tool-call" as const, toolCallId: "search-3", toolName: "search_files",
      args: { keyword: "AG-UI" }, argsText: '{"keyword":"AG-UI"}', result: { files: ["src/App.tsx"] } };
    const { container, root, runtime } = await mount([message([unknownTool])]);
    await act(async () => {
      root.render(<RuntimeFixture chatModel={{ run: async () => ({ content: [] }) }}
        initialMessages={[message([unknownTool])]} model={createModel({ toolGroup: false })}
        onRuntime={() => undefined} />);
      await Promise.resolve();
    });
    expect(container.querySelector('[data-slot="tool-fallback-root"]')).toBeNull();
    expect(container.querySelector('[data-slot="tool-call"]')).toBeNull();

    await act(async () => runtime.thread.reset([message([namedTool])]));
    expect(container.querySelector('[data-slot="tool-fallback-root"]')).toBeNull();
    expect(container.querySelector('[data-slot="tool-call"]')).toBeNull();
  });

  it("forwards an approval click through the real unknown-tool fallback path", async () => {
    const runs = vi.fn<ChatModelAdapter["run"]>(async () => runs.mock.calls.length === 1 ? {
      content: [{ type: "tool-call", toolCallId: "approval-call", toolName: "unknown_tool",
        args: {}, argsText: "{}", approval: { id: "approval-1", prompt: "Allow this action?" } }],
      status: { type: "requires-action", reason: "tool-calls" },
    } : { content: [{ type: "text", text: "done" }] });
    const { container, runtime } = await mount([], { run: runs });
    await act(async () => {
      await runtime.thread.append({ role: "user", content: [{ type: "text", text: "Proceed" }], startRun: true });
      await Promise.resolve();
    });
    expect(container.querySelector('[data-slot="tool-fallback-root"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="tool-fallback-approval"]')).not.toBeNull();
    expect(container.textContent).toContain("Allow");
    expect(container.textContent).toContain("Deny");
    expect(fallbackInvocations).toHaveBeenCalled();
    const allow = [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Allow");
    if (allow === undefined) throw new Error("Approval Allow button is missing");
    await act(async () => { allow.click(); await Promise.resolve(); });
    expect(runs).toHaveBeenCalledTimes(2);
    const approved = runtime.thread.getState().messages.flatMap((item) => item.content)
      .find((part) => part.type === "tool-call" && part.toolCallId === "approval-call");
    expect(approved).toMatchObject({ approval: { id: "approval-1", approved: true } });
  });
});
