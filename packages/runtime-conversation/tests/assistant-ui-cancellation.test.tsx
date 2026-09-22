import { AssistantRuntimeProvider } from "@assistant-ui/react";
import {
  useAgUiRuntime,
  type AgUiAssistantRuntime,
} from "@assistant-ui/react-ag-ui";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import { CancellationAwareHttpAgent } from "../src/compatibility/cancellation-aware-http-agent.js";

function RuntimeFixture({
  agent,
  onRuntime,
}: {
  agent: CancellationAwareHttpAgent;
  onRuntime: (runtime: AgUiAssistantRuntime) => void;
}) {
  const runtime = useAgUiRuntime({ agent });
  onRuntime(runtime);
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div />
    </AssistantRuntimeProvider>
  );
}

function createAbortFailingAgent() {
  let resolvePartial!: () => void;
  const partial = new Promise<void>((resolve) => {
    resolvePartial = resolve;
  });
  const agent = new CancellationAwareHttpAgent({
    url: "http://example.test/agent",
    threadId: "cancel-thread",
    fetch: vi.fn(async (_url: string, init: RequestInit) => {
      const input = JSON.parse(String(init.body)) as {
        threadId: string;
        runId: string;
      };
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          const enqueue = (event: Record<string, unknown>) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
            );
          };
          enqueue({
            type: "RUN_STARTED",
            threadId: input.threadId,
            runId: input.runId,
          });
          enqueue({
            type: "TEXT_MESSAGE_START",
            messageId: "assistant-cancel-1",
            role: "assistant",
          });
          enqueue({
            type: "TEXT_MESSAGE_CONTENT",
            messageId: "assistant-cancel-1",
            delta: "partial",
          });
          resolvePartial();

          const abort = () =>
            controller.error(new Error("BodyStreamBuffer was aborted"));
          if (init.signal?.aborted) abort();
          else init.signal?.addEventListener("abort", abort, { once: true });
        },
      });
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }),
  });
  return { agent, partial };
}

describe("assistant-ui cancellation boundary", () => {
  it("dispatches cancellation instead of a synthetic RUN_ERROR", async () => {
    const { agent, partial } = createAbortFailingAgent();
    let runtime: AgUiAssistantRuntime | undefined;
    let renderer: ReactTestRenderer | undefined;

    try {
      await act(async () => {
        renderer = create(
          <RuntimeFixture
            agent={agent}
            onRuntime={(nextRuntime) => {
              runtime = nextRuntime;
            }}
          />,
        );
        await Promise.resolve();
      });
      if (runtime === undefined) throw new Error("Runtime was not captured");
      const assistantRuntime = runtime;
      const send = assistantRuntime.thread.append({
        role: "user",
        content: [{ type: "text", text: "开始慢流" }],
        startRun: true,
      });

      await act(async () => {
        await partial;
        await Promise.resolve();
        await Promise.resolve();
        expect(
          assistantRuntime.thread.getState().messages.some(
            (message) => message.role === "assistant",
          ),
        ).toBe(true);
        await assistantRuntime.thread.cancelRun();
        await send;
      });

      const assistantMessage = assistantRuntime.thread
        .getState()
        .messages.find((message) => message.role === "assistant");
      expect(assistantMessage?.status).toMatchObject({
        type: "incomplete",
        reason: "cancelled",
      });
      expect(assistantMessage?.status).not.toMatchObject({ reason: "error" });
    } finally {
      if (renderer !== undefined) {
        await act(async () => {
          renderer?.unmount();
        });
      }
    }
  });
});
