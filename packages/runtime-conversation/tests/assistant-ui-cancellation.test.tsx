import { AssistantRuntimeProvider, type AssistantRuntime } from "@assistant-ui/react";
import { useAgUiRuntime } from "@assistant-ui/react-ag-ui";
import { useEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vitest";

import { CancellationAwareHttpAgent } from "../src/compatibility/cancellation-aware-http-agent.js";

function createAbortFailingAgent() {
  let resolveContent!: () => void;
  const content = new Promise<void>((resolve) => {
    resolveContent = resolve;
  });
  const agent = new CancellationAwareHttpAgent({
    url: "http://example.test/agent",
    threadId: "cancel-thread",
    fetch: async (_url, init) => {
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
          resolveContent();

          init.signal?.addEventListener(
            "abort",
            () => controller.error(new Error("BodyStreamBuffer was aborted")),
            { once: true },
          );
        },
        pull() {
          return new Promise<void>(() => {});
        },
      });
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    },
  });
  return { agent, content };
}

function RuntimeFixture({
  agent,
  onRuntime,
}: {
  agent: CancellationAwareHttpAgent;
  onRuntime: (runtime: AssistantRuntime) => void;
}) {
  const runtime = useAgUiRuntime({
    agent,
    showThinking: true,
    unstable_enableMessageQueue: false,
  });
  useEffect(() => onRuntime(runtime), [onRuntime, runtime]);

  return <AssistantRuntimeProvider runtime={runtime}>{null}</AssistantRuntimeProvider>;
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (condition()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error("Timed out waiting for assistant-ui Runtime state");
}

describe("assistant-ui cancellation boundary", () => {
  it("dispatches cancellation through the public assistant-ui Runtime APIs", async () => {
    const { agent, content } = createAbortFailingAgent();
    let runtime: AssistantRuntime | undefined;
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
      if (runtime === undefined) throw new Error("Assistant runtime was not captured");

      const assistantRuntime = runtime;
      await act(async () => {
        assistantRuntime.thread.append({
          role: "user",
          content: [{ type: "text", text: "开始慢流" }],
          startRun: true,
        });
        await content;
        await waitFor(() => assistantRuntime.thread.getState().messages.some(
          (message) => message.role === "assistant" && message.content.some(
            (part) => part.type === "text" && part.text === "partial",
          ),
        ));
      });

      await act(async () => {
        assistantRuntime.thread.cancelRun();
        await waitFor(() => !assistantRuntime.thread.getState().isRunning);
      });

      const assistantMessage = assistantRuntime.thread
        .getState()
        .messages
        .find((message) => message.role === "assistant");
      expect(assistantMessage?.content).toContainEqual({
        type: "text",
        text: "partial",
      });
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
