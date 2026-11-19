import { HttpAgent, Middleware, type AbstractAgent, type RunAgentInput } from "@ag-ui/client";
import { Observable } from "rxjs";
import type { AgentUIBeforeRequest, AgentUIRequestInput, AgentUIRequestPatch } from "../before-request.js";

function record(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("AGENT_UI_INVALID_REQUEST_PATCH");
  return value as Record<string, unknown>;
}

function defined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}

function mergeRequest(input: RunAgentInput, patch: AgentUIRequestPatch): RunAgentInput {
  const { threadId: _thread, runId: _run, ...fields } = defined(patch);
  const merged: RunAgentInput = { ...input, ...fields };
  if (patch.forwardedProps !== undefined) {
    const previous = record(input.forwardedProps);
    const additions = defined(record(patch.forwardedProps));
    const forwardedProps: Record<string, unknown> = { ...previous, ...additions };
    if (additions.ctx !== undefined) forwardedProps.ctx = {
      ...record(previous.ctx), ...defined(record(additions.ctx)),
    };
    merged.forwardedProps = forwardedProps;
  }
  return merged;
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

interface Options {
  getBeforeRequest(): AgentUIBeforeRequest | undefined;
  getThreadId(): string | undefined;
  bindThreadId(id: string): void;
}

const installed = new WeakSet<AbstractAgent>();

/** The public hook prepares wire input; the owner adopts identities before sending. */
export function installConversationBeforeRequest(agent: AbstractAgent, options: Options): void {
  if (installed.has(agent)) return;
  installed.add(agent);
  let activeInput: RunAgentInput | undefined;
  agent.subscribe({
    onRunInitialized: ({ input }) => { activeInput = input; },
    onRunFinalized: ({ input }) => { if (activeInput === input) activeInput = undefined; },
  });
  agent.use(new class extends Middleware {
    override run(input: RunAgentInput, next: AbstractAgent): ReturnType<AbstractAgent["run"]> {
      const hook = options.getBeforeRequest();
      if (!hook && options.getThreadId() !== undefined) return next.run(input);
      const original = activeInput;
      return new Observable(subscriber => {
        const controller = new AbortController();
        const transportSignal = agent instanceof HttpAgent ? agent.abortController.signal : undefined;
        const abort = () => controller.abort();
        transportSignal?.addEventListener("abort", abort, { once: true });
        if (transportSignal?.aborted) abort();
        let stop: (() => void) | undefined;
        const prepare = async () => {
          if (controller.signal.aborted) return;
          const draft: AgentUIRequestInput = {
            ...structuredClone(input),
            threadId: options.getThreadId(),
            runId: undefined,
            forwardedProps: structuredClone(record(input.forwardedProps)),
          };
          const result = await hook?.(draft, { signal: controller.signal });
          if (subscriber.closed || controller.signal.aborted) return;
          const patch = result === undefined ? {} : record(result) as AgentUIRequestPatch;
          if ((patch.threadId !== undefined && !validId(patch.threadId)) ||
            (patch.runId !== undefined && !validId(patch.runId))) throw new Error("AGENT_UI_INVALID_REQUEST_ID");
          const threadId = patch.threadId ?? options.getThreadId() ?? crypto.randomUUID();
          const runId = patch.runId ?? input.runId;
          if (!validId(threadId) || !validId(runId)) throw new Error("AGENT_UI_INVALID_REQUEST_ID");
          const prepared = mergeRequest(input, patch);
          prepared.threadId = threadId;
          prepared.runId = runId;
          options.bindThreadId(threadId);
          agent.threadId = threadId;
          // Upstream subscribers retain the original input object for this run.
          if (original) { original.threadId = threadId; original.runId = runId; }
          const subscription = next.run(prepared).subscribe(subscriber);
          stop = () => subscription.unsubscribe();
        };
        void prepare().catch(error => { if (!subscriber.closed && !controller.signal.aborted) subscriber.error(error); });
        return () => {
          transportSignal?.removeEventListener("abort", abort);
          controller.abort();
          stop?.();
        };
      });
    }
  }());
}
