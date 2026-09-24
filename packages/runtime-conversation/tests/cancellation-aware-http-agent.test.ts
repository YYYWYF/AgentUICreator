import type { AgentSubscriber } from "@ag-ui/client";
import { describe, expect, it, vi } from "vitest";

import { CancellationAwareHttpAgent } from "../src/compatibility/cancellation-aware-http-agent.js";

function createWaitingFetch(error: Error) {
  let resolveStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    resolveStarted = resolve;
  });
  const fetch = vi.fn((_url: string, init: RequestInit): Promise<Response> => {
    resolveStarted();
    return new Promise<never>((_resolve, reject) => {
      if (init.signal?.aborted) {
        reject(error);
        return;
      }
      init.signal?.addEventListener("abort", () => reject(error), { once: true });
    });
  });
  return { fetch, started };
}

describe("CancellationAwareHttpAgent", () => {
  it("normalizes a locally aborted transport failure before AbstractAgent.onError", async () => {
    const { fetch, started } = createWaitingFetch(
      new Error("BodyStreamBuffer was aborted"),
    );
    const agent = new CancellationAwareHttpAgent({
      url: "http://example.test/agent",
      threadId: "cancel-thread",
      fetch,
    });
    const onRunFailed = vi.fn<NonNullable<AgentSubscriber["onRunFailed"]>>();
    const run = agent.runAgent(undefined, { onRunFailed });

    await started;
    agent.abortRun();

    await expect(run).resolves.toEqual({ result: undefined, newMessages: [] });
    expect(onRunFailed).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ name: "AbortError" }),
    }));
  });

  it("normalizes a locally aborted AbortError before AbstractAgent.onError", async () => {
    const abortError = new Error("request aborted");
    abortError.name = "AbortError";
    const { fetch, started } = createWaitingFetch(abortError);
    const agent = new CancellationAwareHttpAgent({
      url: "http://example.test/agent",
      threadId: "cancel-thread",
      fetch,
    });
    const onRunFailed = vi.fn<NonNullable<AgentSubscriber["onRunFailed"]>>();
    const run = agent.runAgent(undefined, { onRunFailed });

    await started;
    agent.abortRun();

    await expect(run).resolves.toEqual({ result: undefined, newMessages: [] });
    expect(onRunFailed).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ name: "AbortError" }),
    }));
  });

  it("keeps a normal network failure as an error after local cancellation", async () => {
    const error = new Error("socket reset");
    const { fetch, started } = createWaitingFetch(error);
    const agent = new CancellationAwareHttpAgent({
      url: "http://example.test/agent",
      threadId: "cancel-thread",
      fetch,
    });
    const onRunFailed = vi.fn<NonNullable<AgentSubscriber["onRunFailed"]>>();
    const run = agent.runAgent(undefined, { onRunFailed });

    await started;
    agent.abortRun();

    await expect(run).rejects.toBe(error);
    expect(onRunFailed).toHaveBeenCalledWith(expect.objectContaining({ error }));
  });

  it("does not classify a transport-shaped error without local cancellation", async () => {
    const error = new Error("BodyStreamBuffer was aborted");
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => {
      throw error;
    });
    const agent = new CancellationAwareHttpAgent({
      url: "http://example.test/agent",
      threadId: "cancel-thread",
      fetch,
    });
    const onRunFailed = vi.fn<NonNullable<AgentSubscriber["onRunFailed"]>>();

    await expect(agent.runAgent(undefined, { onRunFailed })).rejects.toBe(error);
    expect(onRunFailed).toHaveBeenCalledWith(expect.objectContaining({ error }));
  });

  it("does not leak a raw body-stream rejection from reader cleanup", async () => {
    let resolveStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      resolveStarted = resolve;
    });
    let rejectPendingRead!: (reason: unknown) => void;
    const cancel = vi.fn(() => Promise.reject(new Error("BodyStreamBuffer was aborted")));
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const encoder = new TextEncoder();
      const reader = {
        read: vi.fn()
          .mockResolvedValueOnce({
            done: false,
            value: encoder.encode(
              `data: ${JSON.stringify({
                type: "RUN_STARTED",
                threadId: "cancel-thread",
                runId: "cancel-run",
              })}\n\n`,
            ),
          })
          .mockImplementationOnce(() => {
            resolveStarted();
            return new Promise<ReadableStreamReadResult<Uint8Array>>((_resolve, reject) => {
              rejectPendingRead = reject;
            });
          }),
        cancel,
        releaseLock: vi.fn(),
        closed: Promise.resolve(),
      };
      const abort = () => rejectPendingRead(new Error("BodyStreamBuffer was aborted"));
      if (init.signal?.aborted) abort();
      else init.signal?.addEventListener("abort", abort, { once: true });
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "Content-Type": "text/event-stream" }),
        body: { getReader: () => reader },
      } as unknown as Response;
    });
    const agent = new CancellationAwareHttpAgent({
      url: "http://example.test/agent",
      threadId: "cancel-thread",
      fetch,
    });
    const onRunFailed = vi.fn<NonNullable<AgentSubscriber["onRunFailed"]>>();
    const unhandled: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandledRejection);

    try {
      const run = agent.runAgent(undefined, { onRunFailed });
      await started;
      agent.abortRun();

      await expect(run).resolves.toEqual({ result: undefined, newMessages: [] });
      await new Promise<void>((resolve) => setImmediate(resolve));
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }

    expect(unhandled).toEqual([]);
    expect(cancel).toHaveBeenCalled();
    expect(onRunFailed).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ name: "AbortError" }),
    }));
  });
});
