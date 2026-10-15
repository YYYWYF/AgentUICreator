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

const ABORT_LIKE_MESSAGES = new Set([
  "Fetch is aborted",
  "signal is aborted without reason",
  "component unmounted",
]);
const CHROMIUM_BODY_STREAM_ABORT_MESSAGE = "BodyStreamBuffer was aborted";
const MAX_CAUSE_DEPTH = 8;

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Identifies abort-shaped transport errors without assigning cancellation ownership. */
export function isAbortLikeTransportError(value: unknown): boolean {
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
        (ABORT_LIKE_MESSAGES.has(message) ||
          message.includes(CHROMIUM_BODY_STREAM_ABORT_MESSAGE))) ||
      String(current) === "component unmounted"
    ) {
      return true;
    }

    current = current.cause;
  }

  return false;
}

/** Converts an abort-shaped transport error to the cross-runtime canonical form. */
export function toCanonicalAbortError(value: unknown): Error {
  if (value instanceof Error && value.name === "AbortError") return value;

  const normalized = new Error("The operation was aborted", { cause: value });
  normalized.name = "AbortError";
  return normalized;
}
