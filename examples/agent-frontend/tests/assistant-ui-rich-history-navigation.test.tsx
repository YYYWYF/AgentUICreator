// @vitest-environment jsdom

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { useAui, type AssistantRuntime, type ThreadMessage } from "@assistant-ui/react";
import { act, useCallback } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  ConversationRuntimeProvider,
  type ConversationAgentFactory,
} from "@agent-ui/runtime-conversation";
import {
  createConversationServiceThreadBinding,
  type ConversationServiceThreadBinding,
} from "../agent-ui/conversation/threads/conversation-service-thread-binding";
import { createMockConversationApiHandler } from "../dev-mock/conversations/handler";
import {
  createConversationService,
  createHttpConversationDataSource,
  type ConversationService,
} from "../services/conversations";

const mountedRoots: Root[] = [];
const mountedFixtures: Array<{
  detach: () => void;
  service: ConversationService & { dispose(): void };
}> = [];
let server: Server;
let origin: string;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function createAgent(): ReturnType<ConversationAgentFactory> {
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
  const runtime = useAui().threads.__internal_getAssistantRuntime?.();
  if (runtime === undefined) throw new Error("AssistantRuntime is unavailable.");
  onRuntime(runtime);
  return null;
}

function HistoryRuntimeFixture({
  agent,
  binding,
  onRuntime,
}: {
  agent: ReturnType<ConversationAgentFactory>;
  binding: ConversationServiceThreadBinding;
  onRuntime: (runtime: AssistantRuntime) => void;
}) {
  const agentFactory = useCallback(() => agent, [agent]);
  return (
    <ConversationRuntimeProvider
      endpoint="http://example.test/agent"
      threadBinding={binding}
      unstable_agentFactory={agentFactory}
    >
      <RuntimeCapture onRuntime={onRuntime} />
    </ConversationRuntimeProvider>
  );
}

async function mountRuntime() {
  const dataSource = createHttpConversationDataSource({
    endpoint: `${origin}/__agent-ui/mock-data`,
  });
  const service = createConversationService({ dataSource });
  const binding = createConversationServiceThreadBinding();
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
  const root = createRoot(document.createElement("div"));
  mountedRoots.push(root);
  mountedFixtures.push({ detach, service });

  await act(async () => {
    root.render(
      <HistoryRuntimeFixture
        agent={agent}
        binding={binding}
        onRuntime={(nextRuntime) => {
          runtime = nextRuntime;
        }}
      />,
    );
    await Promise.resolve();
  });
  if (runtime === undefined) throw new Error("AssistantRuntime was not captured.");
  await act(async () => {
    runtime?.thread.reset(liveMessages);
    await Promise.resolve();
  });
  return { agent, binding, liveThreadId, runtime };
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
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  for (const fixture of mountedFixtures.splice(0)) {
    fixture.detach();
    fixture.service.dispose();
  }
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error));
  });
});

describe("assistant-ui LangGraph history navigation", () => {
  it("hydrates history without starting an Agent run and restores live messages", async () => {
    const { agent, binding, liveThreadId, runtime } = await mountRuntime();

    await act(async () => {
      await runtime.threads.switchToThread("mock-history-basic");
    });
    expect(binding.getIsDisabled?.()).toBe(true);
    expect(runtime.thread.getState().messages.map((message) => message.id)).toEqual([
      "basic-human-1",
      "basic-ai-1",
    ]);
    expect(agent.runAgent).not.toHaveBeenCalled();

    await act(async () => {
      await runtime.threads.switchToThread(liveThreadId);
    });
    expect(binding.getIsDisabled?.()).toBe(false);
    expect(runtime.thread.getState().messages.map((message) => message.id)).toEqual([
      "live-user",
      "live-assistant",
    ]);
  });

  it("hydrates a completed tool result without invoking the tool or Agent", async () => {
    const { agent, runtime } = await mountRuntime();
    await act(async () => {
      await runtime.threads.switchToThread("mock-history-tool");
    });

    const toolPart = runtime.thread.getState().messages
      .flatMap((message) => message.content)
      .find((part) => part.type === "tool-call");
    expect(toolPart).toMatchObject({
      type: "tool-call",
      toolCallId: "history-search-files-1",
      result: expect.any(String),
    });
    expect(agent.runAgent).not.toHaveBeenCalled();
  });

  it("hydrates the long checkpoint as 28 messages", async () => {
    const { runtime } = await mountRuntime();
    await act(async () => {
      await runtime.threads.switchToThread("mock-history-long");
    });
    expect(runtime.thread.getState().messages).toHaveLength(28);
  });
});
