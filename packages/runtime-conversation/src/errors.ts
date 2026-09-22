export class UnsupportedAgentInputError extends Error {
  readonly code = "AGENT_UI_UNSUPPORTED_INPUT";

  constructor(kind: string) {
    super(`Conversation runtime does not support ${kind} input yet`);
    this.name = "UnsupportedAgentInputError";
  }
}

export class AgentUiRuntimeBusyError extends Error {
  readonly code = "AGENT_UI_RUNTIME_BUSY";

  constructor() {
    super("The conversation runtime is already handling an operation");
    this.name = "AgentUiRuntimeBusyError";
  }
}

const CHROMIUM_BODY_STREAM_ABORT_MESSAGE = "BodyStreamBuffer was aborted";
const MAX_CAUSE_DEPTH = 8;

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Identifies transport cancellation without swallowing ordinary failures. */
export function isExpectedCancellationError(value: unknown): boolean {
  const seen = new Set<object>();
  let current: unknown = value;

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (!isObjectLike(current)) return false;
    if (seen.has(current)) return false;
    seen.add(current);

    const name = current.name;
    const message = current.message;
    if (
      name === "AbortError" ||
      (typeof message === "string" &&
        message.includes(CHROMIUM_BODY_STREAM_ABORT_MESSAGE))
    ) {
      return true;
    }

    current = current.cause;
  }

  return false;
}
