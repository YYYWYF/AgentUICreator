// @vitest-environment jsdom

import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentToolDetail } from "../agent-ui/components/tool-detail";
import { AgentUIRootContext } from "../agent-ui/foundation/context";
import appUIJson from "../app-ui/app-ui.json";
import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import type {
  AgentExecution,
  AgentMessage,
  AgentRunState,
  UIPluginDefinition,
} from "../framework/contracts/ui-plugin";
import { pluginDefinitions } from "../plugins";
import { agentToolDetailPlugin } from "../plugins/agent-tool-detail/definition";
import { MOCK_AUTH_STORAGE_KEY } from "../plugins/mock-auth-login/mock-auth-controller";
import {
  createPluginRegistry,
  PluginServiceRuntime,
  PluginServiceRuntimeContext,
} from "../runtime/plugins";
import {
  AGENT_UI_CONVERSATION_SERVICE,
  type AgentUIConversationService,
  type ConversationSnapshot,
} from "../services/conversations";
import { initialPreviewMessages, previewAgentState } from "../src/preview-data";
import { PluginRuntimeFixture } from "./agent-runtime-fixture";

const idleRun: AgentRunState = { status: "idle" };

const runtimeActions = {
  sendMessage: vi.fn(async () => undefined),
  resumeInterrupts: vi.fn(async () => undefined),
  startNewConversation: vi.fn(async () => undefined),
  abortRun: vi.fn(),
  updateInstanceProps: vi.fn(),
};

function toolMessages({
  argumentsText = "{}",
  error,
  id,
  name,
  result,
  resultMetadata,
}: {
  argumentsText?: string;
  error?: string;
  id: string;
  name: string;
  result?: string;
  resultMetadata?: Record<string, unknown>;
}): AgentMessage[] {
  return [
    {
      id: `${id}-call-message`,
      producer: { type: "root" },
      role: "assistant",
      toolCalls: [{
        id,
        type: "function",
        function: { name, arguments: argumentsText },
      }],
    },
    ...(result === undefined && error === undefined
      ? []
      : [{
          id: `${id}-result`,
          producer: { type: "root" } as const,
          role: "tool" as const,
          toolCallId: id,
          content: result ?? "",
          ...(error === undefined ? {} : { error }),
          ...(resultMetadata === undefined
            ? {}
            : { metadata: resultMetadata }),
        }]),
  ];
}

function toolExecution(
  id: string,
  name: string,
  status: Extract<AgentExecution, { type: "tool" }>["status"],
  error?: string,
): Extract<AgentExecution, { type: "tool" }> {
  return {
    type: "tool",
    id,
    producer: { type: "root" },
    name,
    status,
    arguments: "{}",
    ...(error === undefined ? {} : { error: { message: error } }),
  };
}

function createDetailModel(
  requestedToolCallId?: string,
  includeHistoryService = false,
) {
  return parseAppUIModel({
    version: "2",
    root: {
      type: "slot",
      id: "tool-detail-node",
      slotId: "inspector.tool",
    },
    pluginInstances: {
      ...(includeHistoryService
        ? {
            "history-service-main": {
              id: "history-service-main",
              pluginId: "history-service-fixture",
              enabled: true,
            },
          }
        : {}),
      "agent-tool-detail-main": {
        id: "agent-tool-detail-main",
        pluginId: "agent-tool-detail",
        enabled: true,
        mount: { slotId: "inspector.tool" },
        ...(requestedToolCallId === undefined
          ? {}
          : { props: { toolCallId: requestedToolCallId } }),
      },
    },
  });
}

function historyServicePlugin(
  historyMessages: readonly AgentMessage[],
): UIPluginDefinition {
  const snapshot: ConversationSnapshot = {
    mode: "history",
    conversations: [{ id: "history", title: "History" }],
    activeConversationId: "history",
    historyMessages: [...historyMessages],
    listStatus: "ready",
    detailStatus: "ready",
  };
  const service: AgentUIConversationService = {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    refresh: async () => undefined,
    selectConversation: async () => undefined,
    showLiveConversation: () => undefined,
    startNewConversation: async () => undefined,
  };

  return {
    manifest: {
      id: "history-service-fixture",
      name: "History Service Fixture",
      description: "Provides fixed history messages for Tool Detail tests.",
      version: "1.0.0",
      capabilities: ["headless"],
    },
    provides: [AGENT_UI_CONVERSATION_SERVICE],
    setup: ({ services }) => {
      services.provide(AGENT_UI_CONVERSATION_SERVICE, service);
    },
    Component: () => null,
  };
}

interface MountedToolDetail {
  renderer: ReactTestRenderer;
  dispose(): Promise<void>;
}

async function mountToolDetail({
  definitions = [agentToolDetailPlugin],
  executions = [],
  history = false,
  messages = [],
  model = createDetailModel(undefined, history),
  run = idleRun,
}: {
  definitions?: readonly UIPluginDefinition[];
  executions?: readonly AgentExecution[];
  history?: boolean;
  messages?: readonly AgentMessage[];
  model?: ReturnType<typeof createDetailModel>;
  run?: AgentRunState;
}): Promise<MountedToolDetail> {
  const registry = createPluginRegistry(definitions);
  const serviceRuntime = new PluginServiceRuntime();
  serviceRuntime.reconcile(model, registry, runtimeActions);
  let renderer: ReactTestRenderer | undefined;

  await act(async () => {
    renderer = create(
      <AgentUIRootContext.Provider value={{ portalContainer: null }}>
        <PluginServiceRuntimeContext.Provider value={serviceRuntime}>
          <PluginRuntimeFixture
            actions={runtimeActions}
            conversation={{ id: "live" }}
            executions={[...executions]}
            interrupts={[]}
            messages={[...messages]}
            model={model}
            registry={registry}
            run={run}
            state={previewAgentState}
          />
        </PluginServiceRuntimeContext.Provider>
      </AgentUIRootContext.Provider>,
    );
  });

  if (renderer === undefined) {
    serviceRuntime.dispose();
    throw new Error("Tool Detail renderer was not created");
  }

  return {
    renderer,
    dispose: async () => {
      await act(async () => renderer?.unmount());
      serviceRuntime.dispose();
    },
  };
}

function textContent(node: ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : textContent(child)))
    .join("");
}

describe("Agent Tool Detail runtime binding", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  it("renders the canonical production plugin through AgentToolDetail", async () => {
    localStorage.setItem(MOCK_AUTH_STORAGE_KEY, JSON.stringify({
      userId: "test-user",
      displayName: "Test User",
      email: "test@example.com",
      loggedInAt: "2026-09-11T00:00:00.000Z",
    }));
    const mounted = await mountToolDetail({
      definitions: pluginDefinitions,
      messages: initialPreviewMessages,
      model: parseAppUIModel(appUIJson),
    });

    try {
      expect(mounted.renderer.root.findByProps({
        "data-ui-plugin": "agent-tool-detail",
      })).toBeDefined();
      expect(mounted.renderer.root.findAllByType(AgentToolDetail)).toHaveLength(1);
    } finally {
      await mounted.dispose();
      localStorage.removeItem(MOCK_AUTH_STORAGE_KEY);
    }
  });

  it("honors requested selection, then updates every presentation field", async () => {
    const messages = [
      ...toolMessages({
        id: "call-a",
        name: "first_tool",
        argumentsText: '{"query":"first"}',
        result: '{"value":"first result"}',
      }),
      ...toolMessages({
        id: "call-b",
        name: "second_tool",
        argumentsText: '{"query":"second"}',
        result: '{"value":"second result"}',
      }),
    ];
    const mounted = await mountToolDetail({
      messages,
      model: createDetailModel("call-b"),
    });

    try {
      let detail = mounted.renderer.root.findByType(AgentToolDetail);
      expect(detail.props.name).toBe("second_tool");
      expect(textContent(detail)).toContain("call-b");
      expect(textContent(detail)).toContain("second");
      expect(textContent(detail)).toContain("second result");

      await act(async () => {
        mounted.renderer.root.findByType("select").props.onChange({
          currentTarget: { value: "call-a" },
        });
      });

      detail = mounted.renderer.root.findByType(AgentToolDetail);
      expect(detail.props.name).toBe("first_tool");
      expect(textContent(detail)).toContain("call-a");
      expect(textContent(detail)).toContain("first");
      expect(textContent(detail)).toContain("first result");
      expect(textContent(detail)).not.toContain("second result");
    } finally {
      await mounted.dispose();
    }
  });

  it("selects the latest Tool Call when no instance prop is requested", async () => {
    const mounted = await mountToolDetail({
      messages: [
        ...toolMessages({ id: "older", name: "older_tool", result: "old" }),
        ...toolMessages({ id: "latest", name: "latest_tool", result: "new" }),
      ],
    });

    try {
      const detail = mounted.renderer.root.findByType(AgentToolDetail);
      expect(detail.props.name).toBe("latest_tool");
      expect(textContent(detail)).toContain("latest");
      expect(textContent(detail)).toContain("new");
    } finally {
      await mounted.dispose();
    }
  });

  it.each([
    ["awaiting-result", "running", "执行中", "等待工具返回结果…"],
    ["completed", "completed", "已完成", "completed result"],
    ["error", "error", "失败", "execution failed"],
    ["interrupted", "interrupted", "未完成", "工具没有返回结果"],
  ] as const)(
    "maps %s inspection to %s presentation",
    async (executionStatus, expectedStatus, expectedLabel, expectedResult) => {
      const id = `status-${executionStatus}`;
      const name = `${executionStatus}_tool`;
      const completed = executionStatus === "completed";
      const errored = executionStatus === "error";
      const mounted = await mountToolDetail({
        executions: [toolExecution(
          id,
          name,
          executionStatus,
          errored ? expectedResult : undefined,
        )],
        messages: toolMessages({
          id,
          name,
          ...(completed ? { result: expectedResult } : {}),
        }),
        run: executionStatus === "awaiting-result"
          ? { status: "running" }
          : idleRun,
      });

      try {
        const detail = mounted.renderer.root.findByType(AgentToolDetail);
        expect(detail.props.status).toBe(expectedStatus);
        expect(detail.props.statusLabel).toBe(expectedLabel);
        expect(textContent(detail)).toContain(expectedResult);
        if (executionStatus === "error") {
          expect(mounted.renderer.root.findByProps({ role: "alert" })).toBeDefined();
        }
      } finally {
        await mounted.dispose();
      }
    },
  );

  it("uses history conversation messages instead of live messages", async () => {
    const historyMessages = toolMessages({
      id: "history-call",
      name: "history_tool",
      result: "history result",
    });
    const historyPlugin = historyServicePlugin(historyMessages);
    const mounted = await mountToolDetail({
      definitions: [historyPlugin, agentToolDetailPlugin],
      history: true,
      messages: toolMessages({
        id: "live-call",
        name: "live_tool",
        result: "live result",
      }),
      model: createDetailModel(undefined, true),
    });

    try {
      const output = textContent(mounted.renderer.root.findByType(AgentToolDetail));
      expect(output).toContain("history_tool");
      expect(output).toContain("history result");
      expect(output).not.toContain("live_tool");
      expect(output).not.toContain("live result");
    } finally {
      await mounted.dispose();
    }
  });

  it("renders an explicit empty AgentToolDetail state", async () => {
    const mounted = await mountToolDetail({});

    try {
      const detail = mounted.renderer.root.findByType(AgentToolDetail);
      expect(detail.props.state).toBe("empty");
      expect(textContent(detail)).toContain("当前会话暂无工具调用");
    } finally {
      await mounted.dispose();
    }
  });

  it("preserves Mermaid source without an Ant renderer", async () => {
    const source = "graph TD\n  A[Start] --> B[Done]";
    const mounted = await mountToolDetail({
      messages: toolMessages({
        id: "mermaid-call",
        name: "render_diagram",
        result: source,
        resultMetadata: { agentUI: { render: "mermaid" } },
      }),
    });

    try {
      const fallback = mounted.renderer.root.findByProps({
        "data-tool-result-render": "mermaid-source",
      });
      expect(textContent(fallback)).toContain("Mermaid");
      expect(textContent(fallback)).toContain(source);
    } finally {
      await mounted.dispose();
    }
  });
});
