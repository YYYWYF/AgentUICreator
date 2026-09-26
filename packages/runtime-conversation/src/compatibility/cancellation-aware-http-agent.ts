import {
  HttpAgent,
  type AgentSubscriber,
  type HttpAgentConfig,
  type HttpAgentFetchFn,
  type RunAgentInput,
  type RunAgentParameters,
  type RunAgentResult,
} from "@ag-ui/client";

import {
  isAbortLikeTransportError,
  toCanonicalAbortError,
} from "../errors.js";

function toTransportAbortError(error: unknown): Error {
  if (error instanceof Error && error.name !== "AbortError") return error;

  return new Error("BodyStreamBuffer was aborted", { cause: error });
}

function wrapAbortableResponse(
  response: Response,
  signal: AbortSignal | null | undefined,
): Response {
  const body = response.body;
  if (body === null || signal === null || signal === undefined) return response;

  const wrappedBody = {
    getReader() {
      const reader = body.getReader();
      return {
        read: async () => {
          try {
            return await reader.read();
          } catch (error) {
            if (signal.aborted && isAbortLikeTransportError(error)) {
              throw toTransportAbortError(error);
            }
            throw error;
          }
        },
        cancel(reason?: unknown) {
          return reader.cancel(reason).catch((error) => {
            if (signal.aborted && isAbortLikeTransportError(error)) return;
            throw error;
          });
        },
        releaseLock() {
          reader.releaseLock();
        },
        get closed() {
          return reader.closed;
        },
      };
    },
  } as unknown as ReadableStream<Uint8Array>;

  return new Proxy(response, {
    get(target, property) {
      if (property === "body") return wrappedBody;
      // Native Response methods require the original receiver, not the proxy.
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function createCancellationAwareFetch(fetchImpl: HttpAgentFetchFn): HttpAgentFetchFn {
  return async (url, requestInit) => {
    const response = await fetchImpl(url, requestInit);
    return wrapAbortableResponse(response, requestInit.signal);
  };
}

/**
 * Compatibility shim for @ag-ui/client 0.0.59.
 *
 * Works around two upstream behaviours:
 * 1. Chromium may surface local abort as
 *    "BodyStreamBuffer was aborted".
 * 2. @ag-ui/client 0.0.59 reader teardown may leak
 *    reader.cancel() rejection.
 *
 * This implementation intentionally depends on the
 * 0.0.59 HttpAgent/runHttpRequest transport shape.
 *
 * Re-audit or remove when @ag-ui/client changes.
 */
export class CancellationAwareHttpAgent extends HttpAgent {
  private localCancellationRequested = false;

  constructor(config: HttpAgentConfig) {
    const fetchImpl = config.fetch ?? ((url, requestInit) => fetch(url, requestInit));
    super({
      ...config,
      fetch: createCancellationAwareFetch(fetchImpl),
    });
  }

  override runAgent(
    parameters?: RunAgentParameters,
    subscriber?: AgentSubscriber,
  ): Promise<RunAgentResult> {
    this.localCancellationRequested = false;

    return super.runAgent(parameters, subscriber).finally(() => {
      this.localCancellationRequested = false;
    });
  }

  override abortRun(): void {
    if (this.isRunning) this.localCancellationRequested = true;
    super.abortRun();
  }

  protected override onError(
    input: RunAgentInput,
    error: Error,
    subscribers: AgentSubscriber[],
  ) {
    const normalized =
      this.localCancellationRequested && isAbortLikeTransportError(error)
        ? toCanonicalAbortError(error)
        : error;

    return super.onError(input, normalized, subscribers);
  }
}
