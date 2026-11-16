import type { CreatorWorkspacePublicState } from "../workspace/types.js";
import type { CreatorLocaleMessages } from "./i18n/locale.js";
import { CreatorWorkspaceRequestError, getWorkspaceState, selectWorkspaceProject } from "./workspaceClient.js";

const RETRY_DELAYS = [500, 1_000, 2_000, 4_000] as const;
const RECOVERY_TIMEOUT_MS = 45_000;
const TRANSIENT_START_ERRORS = new Set([
  "CREATOR_START_TIMEOUT", "CREATOR_START_FAILED", "CREATOR_HEALTH_INVALID",
  "CREATOR_RUNTIME_START_FAILED",
]);

function retryableRequest(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof CreatorWorkspaceRequestError &&
    (error.status === 408 || error.status === 429 || (error.status !== undefined && error.status >= 500) ||
      error.code === "CREATOR_COMMAND_BUSY"));
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

/** One mount/reconnect recovery window. Normal reads wait on the server's
 * startup promise; only transient failures use bounded backoff. No idle poll. */
export async function recoverWorkspace(
  previousPath: string | null,
  messages: CreatorLocaleMessages,
  signal: AbortSignal,
): Promise<CreatorWorkspacePublicState> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.throwIfAborted();
  signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error(messages.creatorWorkbench.workspaceRecoveryFailed)), RECOVERY_TIMEOUT_MS);
  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        let state = await getWorkspaceState(messages, controller.signal);
        controller.signal.throwIfAborted();
        if (state.status === "none" && previousPath !== null) {
          state = await selectWorkspaceProject(previousPath, messages, controller.signal);
          controller.signal.throwIfAborted();
        }
        if (state.status !== "ready" || state.runtime.status === "ready") return state;
        if (state.runtime.status === "unavailable") {
          if (!TRANSIENT_START_ERRORS.has(state.runtime.code) || attempt >= RETRY_DELAYS.length) return state;
          // Failed startup has already disposed its worker. Re-select the
          // current server project, never an older browser-stored project.
          state = await selectWorkspaceProject(state.workspace.displayPath, messages, controller.signal);
          controller.signal.throwIfAborted();
          if (state.status !== "ready" || state.runtime.status === "ready") return state;
          if (state.runtime.status === "unavailable" && !TRANSIENT_START_ERRORS.has(state.runtime.code)) return state;
        }
        if (attempt >= RETRY_DELAYS.length) throw new Error(messages.creatorWorkbench.workspaceRecoveryFailed);
      } catch (error) {
        controller.signal.throwIfAborted();
        if (attempt >= RETRY_DELAYS.length || !retryableRequest(error)) throw error;
      }
      await delay(RETRY_DELAYS[attempt]!, controller.signal);
    }
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}
