import type { AbstractAgent, AgentSubscriber } from "@ag-ui/client";
import { describe, expect, it, vi } from "vitest";

import { createCancellationAwareAgent } from "../src/compatibility/cancellation-aware-agent.js";

function createFailingInner(error: Error) {
  const inner = {
    abortRun: vi.fn(),
    runAgent: vi.fn(async (
      _parameters: unknown,
      subscriber?: AgentSubscriber,
    ) => {
      await Promise.resolve();
      await subscriber?.onRunFailed?.({
        error,
        messages: [],
        state: {},
        agent: inner as unknown as AbstractAgent,
        input: {} as never,
      });
      throw error;
    }),
  } as unknown as AbstractAgent;
  return inner;
}

describe("createCancellationAwareAgent", () => {
  it("normalizes a locally aborted transport failure before the subscriber", async () => {
    const inner = createFailingInner(new Error("BodyStreamBuffer was aborted"));
    const agent = createCancellationAwareAgent(inner);
    const onRunFailed = vi.fn();
    const run = agent.runAgent(undefined, { onRunFailed });

    agent.abortRun();

    await expect(run).resolves.toEqual({ result: undefined, newMessages: [] });
    expect(inner.abortRun).toHaveBeenCalledOnce();
    expect(onRunFailed).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ name: "AbortError" }),
    }));
  });

  it("preserves an ordinary failure without a local cancellation", async () => {
    const error = new Error("network connection failed");
    const inner = createFailingInner(error);
    const agent = createCancellationAwareAgent(inner);
    const onRunFailed = vi.fn();

    await expect(agent.runAgent(undefined, { onRunFailed })).rejects.toBe(error);
    expect(onRunFailed).toHaveBeenCalledWith(expect.objectContaining({ error }));
  });
});
