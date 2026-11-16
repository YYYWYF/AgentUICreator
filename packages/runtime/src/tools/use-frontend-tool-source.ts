import { useLayoutEffect, useMemo } from "react";
import type { AgentFrontendToolSource } from "@za38.03/agent-ui-core";
import type { ConversationToolkit } from "../plugin-api/index.js";
import { runAbortableTool } from "../host/frontend-tools.js";

/** A replacement or unmount also cancels callbacks that ignore their run signal. */
function useToolCancellation(owner: unknown) {
  const binding = useMemo(() => {
    const pending = new Set<AbortController>();
    let active = false;
    return {
      async run<T>(signal: AbortSignal, execute: (signal: AbortSignal) => Promise<T>): Promise<T> {
        if (!active) throw new DOMException("AGENT_UI_TOOL_SOURCE_INACTIVE", "AbortError");
        const controller = new AbortController();
        const abort = () => controller.abort();
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) controller.abort();
        pending.add(controller);
        try { return await runAbortableTool(controller.signal, () => execute(controller.signal)); }
        finally { signal.removeEventListener("abort", abort); pending.delete(controller); }
      },
      activate: () => { active = true; },
      cancel: () => { active = false; pending.forEach(controller => controller.abort()); pending.clear(); },
    };
  }, [owner]);
  useLayoutEffect(() => { binding.activate(); return binding.cancel; }, [binding]);
  return binding;
}

/** Cancel pending page callbacks when their source is replaced or the Agent unmounts. */
export function useFrontendToolSource(source: AgentFrontendToolSource | undefined): AgentFrontendToolSource | undefined {
  const binding = useToolCancellation(source);
  return useMemo(() => source && {
    getRevision: () => source.getRevision(),
    subscribe: listener => source.subscribe(listener),
    listTools: () => source.listTools(),
    execute: (call, { signal }) => binding.run(signal, next => source.execute(call, { signal: next })),
  } satisfies AgentFrontendToolSource, [source, binding]);
}

/** Native toolkit callbacks retain the upstream context and cancellation semantics. */
export function useFrontendToolkit(toolkit: ConversationToolkit | undefined): ConversationToolkit | undefined {
  const binding = useToolCancellation(toolkit);
  return useMemo(() => toolkit && Object.fromEntries(Object.entries(toolkit).map(([name, entry]) => [name,
    entry.type !== "frontend" || typeof entry.execute !== "function" ? entry : {
      ...entry,
      execute: (input, context) => binding.run(context.abortSignal,
        async signal => entry.execute(input, { ...context, abortSignal: signal })),
    } satisfies typeof entry,
  ])), [toolkit, binding]);
}
