// @vitest-environment jsdom

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import {
  AuiConfig,
  Tools,
  useAui,
  type AssistantRuntime,
  type ThreadMessage,
} from "@assistant-ui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { useCallback, useMemo } from "react";

import {
  AssistantUiAgUiRuntimeProvider,
  type AssistantUiAgentFactory,
} from "@agent-ui/runtime-assistant-ui";
import { createMockConversationApiHandler } from "../dev-mock/conversations/handler";
import { createAssistantUiSemanticThreadComponents } from "../agent-ui/adapters/assistant-ui/conversation";
import { AssistantUiConversationSurface } from "../agent-ui/adapters/assistant-ui/conversation/AssistantUiConversationSurface";
import { createAssistantUiToolkit } from "../agent-ui/adapters/assistant-ui/toolkit";
import {
  createConversationServiceAssistantUiThreadBinding,
  type ConversationServiceAssistantUiThreadBinding,
} from "../agent-ui/adapters/assistant-ui/threads/conversation-service-thread-binding";
import {
  createHttpConversationDataSource,
  createConversationController,
  type AgentUIConversationService,
} from "../services/conversations";
import type { UIPluginComponentProps } from "../framework/contracts/ui-plugin";

const renderFallback: UIPluginComponentProps["renderSlot"] = (
  _slotId,
  fallback,
) => fallback;
const mountedRoots: Root[] = [];
const mountedFixtures: Array<{
  detach: () => void;
  service: AgentUIConversationService & { dispose(): void };
}> = [];

let server: Server;
let origin: string;

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverMock {
  constructor(_callback: ResizeObserverCallback) {}
  observe(_target: Element): void {}
  unobserve(_target: Element): void {}
  disconnect(): void {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);
Object.defineProperty(HTMLElement.prototype, "scrollTo", {
  configurable: true,
  value: () => undefined,
});

async function expandTool(container: HTMLDivElement): Promise<void> {
  const trigger = container.querySelector('[data-slot="tool-call"] button');
  if (!(trigger instanceof HTMLElement)) {
    throw new Error("Tool call trigger is missing.");
  }
  await act(async () => {
    trigger.click();
    await Promise.resolve();
  });
}

async function revealAttachmentName(container: HTMLDivElement): Promise<void> {
  const trigger = container.querySelector('[aria-label="Document attachment"]');
  if (!(trigger instanceof HTMLElement)) {
    throw new Error("Document attachment trigger is missing.");
  }
  await act(async () => {
    trigger.focus();
    trigger.dispatchEvent(new Event("focusin", { bubbles: true }));
    await Promise.resolve();
  });
}

function createAgent(): ReturnType<AssistantUiAgentFactory> {
  return {
    threadId: "live",
    runAgent: vi.fn(),
    abortRun: vi.fn(),
    subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
  } as never;
}

function RuntimeCapture({
  onRuntime,
}: {
  onRuntime: (runtime: AssistantRuntime) => void;
}) {
  const aui = useAui();
  const runtime = aui.threads.__internal_getAssistantRuntime?.();
  if (runtime === undefined) {
    throw new Error("AssistantRuntime is unavailable from the assistant-ui client.");
  }
  onRuntime(runtime);
  return null;
}

function RichHistoryRuntimeFixture({
  agent,
  binding,
  onRuntime,
}: {
  agent: ReturnType<AssistantUiAgentFactory>;
  binding: ConversationServiceAssistantUiThreadBinding;
  onRuntime: (runtime: AssistantRuntime) => void;
}) {
  const agentFactory = useCallback(() => agent, [agent]);
  const components = useMemo(
    () => createAssistantUiSemanticThreadComponents(renderFallback),
    [],
  );
  const config = useMemo(
    () => AuiConfig({
      tools: Tools({
        toolkit: createAssistantUiToolkit({ mockAgentElements: true }),
      }),
    }),
    [],
  );

  return (
    <AssistantUiAgUiRuntimeProvider
      endpoint="http://example.test/agent"
      threadBinding={binding}
      unstable_agentFactory={agentFactory}
      config={config}
    >
      <RuntimeCapture onRuntime={onRuntime} />
      <AssistantUiConversationSurface components={components} />
    </AssistantUiAgUiRuntimeProvider>
  );
}

async function mountRuntime() {
  const dataSource = createHttpConversationDataSource({
    endpoint: `${origin}/__agent-ui/mock-data`,
  });
  const service = createConversationController({ dataSource });
  const binding = createConversationServiceAssistantUiThreadBinding();
  const detach = binding.attachConversationService(service);
  await service.refresh();

  const liveMessages: ThreadMessage[] = [
    {
      id: "live-user",
      role: "user",
      content: [{ type: "text", text: "live user" }],
      attachments: [],
      createdAt: new Date(0),
      metadata: { custom: {} },
    },
    {
      id: "live-assistant",
      role: "assistant",
      content: [{ type: "text", text: "live assistant" }],
      status: { type: "complete", reason: "stop" },
      createdAt: new Date(0),
      metadata: {
        unstable_state: null,
        unstable_annotations: [],
        unstable_data: [],
        steps: [],
        custom: {},
      },
    },
  ];
  binding.captureLiveThread({ messages: liveMessages });
  const liveThreadId = binding.getThreadId();
  const agent = createAgent();
  let runtime: AssistantRuntime | undefined;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  mountedFixtures.push({ detach, service });

  await act(async () => {
    root.render(
      <RichHistoryRuntimeFixture
        agent={agent}
        binding={binding}
        onRuntime={(nextRuntime) => {
          runtime = nextRuntime;
        }}
      />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  if (runtime === undefined) throw new Error("AssistantRuntime was not captured.");
  await act(async () => {
    runtime?.thread.reset(liveMessages);
    await Promise.resolve();
  });

  return {
    agent,
    binding,
    container,
    liveThreadId,
    runtime,
  };
}

function assistantMessage(
  runtime: AssistantRuntime,
  id: string,
): Extract<ThreadMessage, { role: "assistant" }> {
  const message = runtime.thread.getState().messages.find(
    (candidate) => candidate.id === id,
  );
  if (message?.role !== "assistant") {
    throw new Error(`Assistant replay message not found: ${id}`);
  }
  return message;
}

beforeAll(async () => {
  const handler = createMockConversationApiHandler({
    listDelayMs: 0,
    detailDelayMs: 0,
  });
  server = createServer((request, response) => {
    void handler(request, response).then((handled) => {
      if (!handled) {
        response.statusCode = 404;
        response.end();
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  for (const fixture of mountedFixtures.splice(0)) {
    fixture.detach();
    fixture.service.dispose();
  }
  document.body.replaceChildren();
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error));
  });
});

describe("assistant-ui rich history navigation", () => {
  it("hydrates Agent Elements through the service and returns to live", async () => {
    const { agent, binding, container, liveThreadId, runtime } = await mountRuntime();

    await act(async () => {
      await runtime.threads.switchToThread("conversation-replay-agent-elements");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(binding.getThreadId()).toBe("conversation-replay-agent-elements");
    expect(binding.getIsDisabled?.()).toBe(true);
    expect(runtime.threads.getState().mainThreadId).toBe(
      "conversation-replay-agent-elements",
    );
    expect(runtime.thread.getState().threadId).toBe(
      "conversation-replay-agent-elements",
    );
    const message = assistantMessage(runtime, "replay-agent-elements-assistant");
    expect(message.content.filter((part) => part.type === "reasoning")).toHaveLength(1);
    expect(message.content.filter((part) => part.type === "text")).toHaveLength(1);
    expect(message.content.filter((part) => part.type === "tool-call").map(
      (part) => part.type === "tool-call" ? part.toolName : "",
    )).toEqual([
      "mock_agent_plan",
      "mock_agent_status",
      "mock_dispatch_subagent",
      "mock_dispatch_subagent",
      "mock_dispatch_subagent",
    ]);
    expect(container.querySelector('[data-slot="agent-plan"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="agent-status"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="subagent-list"]')).not.toBeNull();
    const subagentList = container.querySelector('[data-slot="subagent-list"]');
    expect(subagentList?.classList.contains("min-h-[14.5rem]")).toBe(true);
    expect(container.textContent).toContain("Analysis complete");
    expect(agent.runAgent).not.toHaveBeenCalled();

    await act(async () => {
      await runtime.threads.switchToThread(liveThreadId);
      await Promise.resolve();
    });
    expect(binding.getThreadId()).toBe(liveThreadId);
    expect(binding.getIsDisabled?.()).toBe(false);
    expect(runtime.thread.getState().messages.map((message) => message.id)).toEqual([
      "live-user",
      "live-assistant",
    ]);
  });

  it("hydrates dedicated Subagents replay without rerunning the Agent", async () => {
    const { agent, binding, container, runtime } = await mountRuntime();

    await act(async () => {
      await runtime.threads.switchToThread("conversation-replay-subagents");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(binding.getThreadId()).toBe("conversation-replay-subagents");
    expect(runtime.thread.getState().threadId).toBe("conversation-replay-subagents");
    const message = assistantMessage(runtime, "replay-subagents-assistant");
    const dispatches = message.content.filter((part) => part.type === "tool-call");
    expect(dispatches).toHaveLength(3);
    expect(dispatches.every((part) =>
      part.type === "tool-call" && part.toolName === "mock_dispatch_subagent"
    )).toBe(true);
    expect(container.querySelectorAll('[data-slot="subagent-list"]')).toHaveLength(1);
    expect(container.querySelector('[data-slot="tool-group-trigger"]')).toBeNull();
    expect(container.textContent).toContain("Architecture Researcher");
    expect(container.textContent).toContain("Runtime Inspector");
    expect(container.textContent).toContain("UI Reviewer");
    expect(container.textContent).not.toContain("3 tool calls");
    expect(agent.runAgent).not.toHaveBeenCalled();
  });

  it("hydrates reasoning and tool replay with args and result through navigation", async () => {
    const { agent, binding, container, runtime } = await mountRuntime();

    await act(async () => {
      await runtime.threads.switchToThread("conversation-replay-tool");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(binding.getThreadId()).toBe("conversation-replay-tool");
    await expandTool(container);
    const message = assistantMessage(runtime, "replay-tool-assistant");
    const tool = message.content.find((part) => part.type === "tool-call");
    if (tool?.type !== "tool-call") throw new Error("Replay tool call not found.");
    expect(tool).toMatchObject({
      toolCallId: "replay-search-files-1",
      toolName: "search_files",
      args: { keyword: "AG-UI" },
      result: {
        files: [
          "packages/runtime-agui/src/AgUiTransport.ts",
          "packages/runtime-agui/src/lifecycle-projector.ts",
        ],
      },
    });
    expect(message.content.filter((part) => part.type === "reasoning")).toHaveLength(2);
    expect(message.content.filter((part) => part.type === "text")).toHaveLength(1);
    expect(container.querySelector('[data-slot="tool-call"]')).not.toBeNull();
    expect(container.textContent).toContain("Searched files");
    expect(container.textContent).toContain("Request");
    expect(container.textContent).toContain("Result");
    expect(agent.runAgent).not.toHaveBeenCalled();
  });

  it("hydrates persisted sources and attachments through navigation", async () => {
    const { agent, binding, container, runtime } = await mountRuntime();

    await act(async () => {
      await runtime.threads.switchToThread("conversation-replay-sources-attachments");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(binding.getThreadId()).toBe("conversation-replay-sources-attachments");
    await revealAttachmentName(container);
    const user = runtime.thread.getState().messages.find(
      (message) => message.id === "replay-sources-user",
    );
    if (user?.role !== "user") throw new Error("Replay user message not found.");
    expect(user.attachments).toEqual([expect.objectContaining({
      id: "replay-architecture-notes",
      name: "architecture-notes.md",
    })]);
    const assistant = assistantMessage(runtime, "replay-sources-assistant");
    expect(assistant.content.filter((part) => part.type === "source")).toEqual([
      expect.objectContaining({
        sourceType: "url",
        title: "AG-UI Runtime Notes",
      }),
      expect.objectContaining({
        sourceType: "document",
        title: "Architecture Notes",
        filename: "architecture-notes.md",
      }),
    ]);
    expect(document.body.textContent).toContain("architecture-notes.md");
    expect(container.textContent).not.toContain("AG-UI Runtime Notes");
    expect(container.textContent).not.toContain("Architecture Notes");
    expect(agent.runAgent).not.toHaveBeenCalled();
  });
});
