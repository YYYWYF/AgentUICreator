import type { AgentFrontendToolSource } from "@za38.03/agent-ui-core";
import { ConversationToolFallback, type ConversationToolkit } from "@za38.03/agent-ui-plugins";
import type { Toolkit } from "@assistant-ui/react";
import { createInterruptToolRenderer } from "./interrupt-tool-renderer.js";
import type { ConversationFrontendToolUIRegistry } from "./types.js";

/** Application permission is supplied by source; UI registration never grants it. */
export function createAssistantUiFrontendToolkit(
  source: AgentFrontendToolSource | undefined,
  backend: ConversationToolkit = {},
  frontendUIs: ConversationFrontendToolUIRegistry = {},
): Toolkit {
  const toolkit: Toolkit = Object.assign(Object.create(null), backend);
  for (const [name, entry] of Object.entries(backend)) {
    const interactionType = entry.interaction?.type;
    if (interactionType !== "interrupt" && interactionType !== "command") continue;
    if (entry.type !== "human") throw new Error(`Interactive tool must be human: "${name}"`);
    toolkit[name] = { ...entry, render: createInterruptToolRenderer(entry.render) } as never;
  }
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
      ...(ui?.display === undefined ? {} : { display: ui.display }),
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
  // UI registration never grants execution permission. Upstream excludes backend
  // entries from the model schema, while Tools still registers their renderers.
  for (const [name, ui] of Object.entries(frontendUIs)) {
    if (Object.hasOwn(toolkit, name)) continue;
    toolkit[name] = {
      type: "backend",
      ...(ui.display === undefined ? {} : { display: ui.display }),
      render: ui.render as never,
    };
  }
  return toolkit;
}
