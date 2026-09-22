import { AgUiThreadRuntimeCore } from "../node_modules/@assistant-ui/react-ag-ui/dist/runtime/AgUiThreadRuntimeCore.js";
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

describe("assistant-ui cancellation boundary", () => {
  it("dispatches cancellation instead of a synthetic RUN_ERROR", async () => {
    const { agent, content } = createAbortFailingAgent();
    const core = new AgUiThreadRuntimeCore({
      agent,
      logger: { debug: () => {}, error: () => {} },
      showThinking: true,
      notifyUpdate: () => {},
    });

    const run = core.append({
      role: "user",
      content: [{ type: "text", text: "开始慢流" }],
      startRun: true,
    });

    await content;
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(
      core.getMessages().some((message) => message.role === "assistant"),
    ).toBe(true);

    await core.cancel();
    await run;

    const assistantMessage = core
      .getMessages()
      .find((message) => message.role === "assistant");
    expect(assistantMessage?.status).toMatchObject({
      type: "incomplete",
      reason: "cancelled",
    });
    expect(assistantMessage?.status).not.toMatchObject({ reason: "error" });
  });
});
