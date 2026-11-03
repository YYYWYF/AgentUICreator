import type {
  AgentFrontendToolCall,
  AgentFrontendToolDefinition,
  AgentFrontendToolExecuteOptions,
  AgentFrontendToolResult,
  AgentFrontendToolSource,
} from "@za38.03/agent-ui-core";

export interface AgentUIFrontendToolContext {
  readonly signal: AbortSignal;
  readonly toolCallId: string;
}

/** The Host validates input against its business contract before changing its page. */
export interface AgentUIFrontendTool extends AgentFrontendToolDefinition {
  execute(input: unknown, context: AgentUIFrontendToolContext): unknown | Promise<unknown>;
}

export function throwIfToolAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("AGENT_UI_TOOL_ABORTED", "AbortError");
}

/** Reject promptly on cancellation, including when a Host callback ignores its signal. */
export function runAbortableTool<T>(signal: AbortSignal, run: () => Promise<T>): Promise<T> {
  throwIfToolAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException("AGENT_UI_TOOL_ABORTED", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve().then(() => { throwIfToolAborted(signal); return run(); }).then(
      value => { throwIfToolAborted(signal); return value; },
    ).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

/** Static Host callbacks, advertised through the existing canonical frontend-tool pipeline. */
export function createAgentUIFrontendTools(tools: readonly AgentUIFrontendTool[]): AgentFrontendToolSource {
  const entries = new Map<string, AgentUIFrontendTool>();
  for (const tool of tools) {
    if (!/^[a-z][a-z0-9_]{0,63}$/u.test(tool.name) || !tool.description.trim() || typeof tool.execute !== "function") throw new Error("AGENT_UI_TOOL_DEFINITION_INVALID");
    if (entries.has(tool.name)) throw new Error(`AGENT_UI_TOOL_NAME_COLLISION: ${tool.name}`);
    if (tool.inputSchema === null || typeof tool.inputSchema !== "object" || Array.isArray(tool.inputSchema)) throw new Error("AGENT_UI_TOOL_SCHEMA_INVALID");
    entries.set(tool.name, { ...tool, inputSchema: structuredClone(tool.inputSchema) });
  }
  return {
    getRevision: () => 0,
    subscribe: () => () => {},
    listTools: () => [...entries.values()].map(({ name, description, inputSchema }) => ({ name, description, inputSchema: structuredClone(inputSchema) })),
    async execute(call, { signal }) {
      throwIfToolAborted(signal);
      if (call.producer.type !== "root") return { content: "", error: "AGENT_UI_TOOL_ROOT_ONLY" };
      const tool = entries.get(call.name);
      if (!tool) return { content: "", error: "AGENT_UI_TOOL_UNAVAILABLE" };
      try {
        const result = await runAbortableTool(signal, async () => tool.execute(call.input, { signal, toolCallId: call.id }));
        const content = typeof result === "string" ? result : JSON.stringify(result ?? null);
        if (content === undefined) throw new Error("AGENT_UI_TOOL_RESULT_INVALID");
        return { content };
      } catch (error) {
        throwIfToolAborted(signal);
        return { content: "", error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

/** Merge project and Host capabilities; duplicate names never override an existing permission. */
export function combineAgentFrontendToolSources(...inputs: readonly (AgentFrontendToolSource | undefined)[]): AgentFrontendToolSource {
  const sources = [...new Set(inputs.filter((source): source is AgentFrontendToolSource => source !== undefined))];
  let signature = "";
  let revision = 0;
  const catalog = () => {
    const entries = new Map<string, { source: AgentFrontendToolSource; definition: AgentFrontendToolDefinition }>();
    for (const source of sources) {
      for (const definition of source.listTools()) {
        if (entries.has(definition.name)) throw new Error(`AGENT_UI_TOOL_NAME_COLLISION: ${definition.name}`);
        entries.set(definition.name, { source, definition });
      }
    }
    return entries;
  };
  return {
    getRevision() {
      const next = JSON.stringify(sources.map(source => source.getRevision()));
      if (next !== signature) { signature = next; ++revision; }
      return revision;
    },
    subscribe(listener) {
      const cleanups: (() => void)[] = [];
      try { for (const source of sources) cleanups.push(source.subscribe(listener)); }
      catch (error) { cleanups.forEach(cleanup => cleanup()); throw error; }
      return () => cleanups.forEach(cleanup => cleanup());
    },
    listTools: () => [...catalog().values()].map(entry => entry.definition),
    execute(call: AgentFrontendToolCall, options: AgentFrontendToolExecuteOptions): Promise<AgentFrontendToolResult> {
      throwIfToolAborted(options.signal);
      if (call.producer.type !== "root") return Promise.resolve({ content: "", error: "AGENT_UI_TOOL_ROOT_ONLY" });
      const source = catalog().get(call.name)?.source;
      return source ? runAbortableTool(options.signal, () => source.execute(call, options))
        : Promise.resolve({ content: "", error: "AGENT_UI_TOOL_UNAVAILABLE" });
    },
  };
}
