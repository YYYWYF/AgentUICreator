import { useLayoutEffect, useMemo } from "react";
import type { AgentFrontendToolSource } from "@za38.03/agent-ui-core";
import { runAbortableTool } from "../host/frontend-tools.js";

/** Cancel pending page callbacks when their source is replaced or the Agent unmounts. */
export function useFrontendToolSource(source: AgentFrontendToolSource | undefined): AgentFrontendToolSource | undefined {
  const binding = useMemo(() => {
    const pending = new Set<AbortController>();
    let active = false;
    const wrapped: AgentFrontendToolSource | undefined = source && {
      getRevision: () => source.getRevision(),
      subscribe: listener => source.subscribe(listener),
      listTools: () => source.listTools(),
      async execute(call, { signal }) {
        if (!active) throw new DOMException("AGENT_UI_TOOL_SOURCE_INACTIVE", "AbortError");
        const controller = new AbortController();
        const abort = () => controller.abort();
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) controller.abort();
        pending.add(controller);
        try { return await runAbortableTool(controller.signal, () => source.execute(call, { signal: controller.signal })); }
        finally { signal.removeEventListener("abort", abort); pending.delete(controller); }
      },
    };
    return { wrapped, activate: () => { active = true; }, cancel: () => { active = false; pending.forEach(controller => controller.abort()); pending.clear(); } };
  }, [source]);
  useLayoutEffect(() => { binding.activate(); return binding.cancel; }, [binding]);
  return binding.wrapped;
}
