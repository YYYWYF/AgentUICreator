import type {
  AbstractAgent,
  AgentSubscriber,
  RunAgentParameters,
  RunAgentResult,
} from "@ag-ui/client";

import { isExpectedCancellationError } from "../errors.js";

function toAbortError(error: Error): Error {
  if (error.name === "AbortError") return error;
  const normalized = new Error("The operation was aborted.", { cause: error });
  normalized.name = "AbortError";
  return normalized;
}

function wrapSubscriber(
  subscriber: AgentSubscriber | undefined,
  normalizeError: (error: Error) => Error,
): AgentSubscriber | undefined {
  if (subscriber?.onRunFailed === undefined) return subscriber;

  return {
    ...subscriber,
    onRunFailed: (params) => subscriber.onRunFailed?.({
      ...params,
      error: normalizeError(params.error),
    }),
  };
}

/**
 * Keeps locally initiated transport aborts on assistant-ui's cancellation rail.
 * The proxy preserves the inner agent's state and subscriber registry while
 * normalizing the failure before AbstractAgent forwards it to the caller.
 */
export function createCancellationAwareAgent(
  inner: AbstractAgent,
): AbstractAgent {
  let activeRun: { cancellationRequested: boolean } | undefined;

  const runAgent = async (
    parameters?: RunAgentParameters,
    subscriber?: AgentSubscriber,
  ): Promise<RunAgentResult> => {
    const currentRun = { cancellationRequested: false };
    activeRun = currentRun;
    try {
      const innerRunAgent = Reflect.get(inner, "runAgent") as (
        nextParameters?: RunAgentParameters,
        nextSubscriber?: AgentSubscriber,
      ) => Promise<RunAgentResult>;
      return await Reflect.apply(innerRunAgent, inner, [
        parameters,
        wrapSubscriber(subscriber, (error) =>
          currentRun.cancellationRequested && isExpectedCancellationError(error)
            ? toAbortError(error)
            : error
        ),
      ]);
    } catch (error) {
      if (currentRun.cancellationRequested && isExpectedCancellationError(error)) {
        return { result: undefined, newMessages: [] };
      }
      throw error;
    } finally {
      if (activeRun === currentRun) activeRun = undefined;
    }
  };

  const abortRun = (): void => {
    if (activeRun !== undefined) activeRun.cancellationRequested = true;
    inner.abortRun();
  };

  return new Proxy(inner, {
    get(target, property, receiver) {
      if (property === "runAgent") return runAgent;
      if (property === "abortRun") return abortRun;
      return Reflect.get(target, property, receiver);
    },
  });
}
