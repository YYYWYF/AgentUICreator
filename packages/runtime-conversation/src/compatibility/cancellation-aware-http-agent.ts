import {
  HttpAgent,
  type AgentSubscriber,
  type RunAgentInput,
  type RunAgentParameters,
  type RunAgentResult,
} from "@ag-ui/client";

import {
  isAbortLikeTransportError,
  toCanonicalAbortError,
} from "../errors.js";

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
