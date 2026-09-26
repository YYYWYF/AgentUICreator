import type { AgentFrontendToolSource } from "@agent-ui/runtime-core";
import { ConversationToolFallback, type ConversationToolkit } from "@agent-ui/react";
import type { Toolkit } from "@assistant-ui/react";
import type { ConversationFrontendToolUIRegistry } from "./types.js";

/** Application permission is supplied by source; UI registration never grants it. */
export function createAssistantUiFrontendToolkit(
  source: AgentFrontendToolSource | undefined,
  backend: ConversationToolkit = {},
  frontendUIs: ConversationFrontendToolUIRegistry = {},
): Toolkit {
  const toolkit: Toolkit = Object.assign(Object.create(null), backend);
  for (const name of Object.keys(frontendUIs)) {
    if (Object.hasOwn(backend, name)) throw new Error(`Tool name collision: "${name}"`);
  }
  for (const definition of source?.listTools() ?? []) {
    if (Object.hasOwn(toolkit, definition.name)) throw new Error(`Tool name collision: "${definition.name}"`);
    const ui = frontendUIs[definition.name];
    toolkit[definition.name] = {
      type: "frontend",
      description: definition.description,
      parameters: definition.inputSchema,
      display: ui?.display ?? "standalone",
      render: (ui?.render ?? ConversationToolFallback) as never,
      execute: async (args, context) => {
        const result = await source!.execute({
          id: context.toolCallId,
          name: definition.name,
          input: args,
          // The native root thread pipeline provides no subagent attribution.
          producer: { type: "root" },
        }, { signal: context.abortSignal });
        if (result.error !== undefined) throw new Error(result.error);
        try { return JSON.parse(result.content) as unknown; }
        catch { return result.content; }
      },
    };
  }
  return toolkit;
}
