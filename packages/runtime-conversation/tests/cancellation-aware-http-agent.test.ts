import type { AgentSubscriber } from "@ag-ui/client";
import { describe, expect, it, vi } from "vitest";

import { CancellationAwareHttpAgent } from "../src/compatibility/cancellation-aware-http-agent.js";

function createWaitingFetch(error: Error) {
  let resolveStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    resolveStarted = resolve;
  });
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    resolveStarted();
    await new Promise<never>((_resolve, reject) => {
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
});
