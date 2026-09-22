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

/**
 * @ag-ui/client cancels its response reader again when the request observable
 * is torn down. Chromium can reject that second cancellation with the same
 * body-stream abort that was already delivered to the reader. A native
 * AbortError must stay out of the AG-UI HTTP transform: that transform turns
 * it into RUN_ERROR. Keep the transport failure as a non-AbortError so the
 * AbstractAgent.onError boundary can normalize it before assistant-ui sees it.
 * Keep cleanup rejection handling here as well.
 */
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
      return Reflect.get(target, property, target);
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
 * Compatibility shim for the current AG-UI / assistant-ui baseline.
 *
 * Chromium may surface a locally aborted response body as
 * "BodyStreamBuffer was aborted", which these pinned versions do not
 * classify as cancellation.
 *
 * Remove once the pinned upstream stack normalizes this case itself.
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
