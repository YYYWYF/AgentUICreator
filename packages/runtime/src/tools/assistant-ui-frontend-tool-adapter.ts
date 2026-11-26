import type { AgentFrontendToolSource } from "@za38.03/agent-ui-core";
import { ConversationDefaultTool } from "../presentation.js";
import { type ConversationToolkit } from "../plugin-api/index.js";
import type { Toolkit } from "@assistant-ui/react";
import { createInterruptToolRenderer } from "./interrupt-tool-renderer.js";

/** Only explicit frontend callbacks or an authorized source grant execution. */
export function createAssistantUiFrontendToolkit(
  source: AgentFrontendToolSource | undefined,
  entries: ConversationToolkit = {},
): Toolkit {
  const toolkit: Toolkit = Object.assign(Object.create(null), entries);
  for (const [name, entry] of Object.entries(entries)) {
    if (entry.type === "frontend") {
      if (!/^[a-z][a-z0-9_]{0,63}$/u.test(name) || !entry.description?.trim() ||
          !entry.parameters || typeof entry.parameters !== "object" || Array.isArray(entry.parameters) ||
          typeof entry.execute !== "function") throw new Error(`Invalid frontend tool: "${name}"`);
      if (entry.disabled) {
        toolkit[name] = {
          type: "backend", render: (entry.render ?? ConversationDefaultTool) as never,
          ...(entry.display === undefined ? {} : { display: entry.display }),
        };
        continue;
      }
      toolkit[name] = { ...entry, render: entry.render ?? ConversationDefaultTool } as never;
      continue;
    }
    if (entry.type === "backend") {
      toolkit[name] = { ...entry, render: entry.render ?? ConversationDefaultTool } as never;
    }
    const interactionType = entry.interaction?.type;
    if (interactionType !== "interrupt" && interactionType !== "command") continue;
    if (entry.type !== "human") throw new Error(`Interactive tool must be human: "${name}"`);
    toolkit[name] = { ...entry, render: createInterruptToolRenderer(entry.render) } as never;
  }
  for (const definition of source?.listTools() ?? []) {
    const ui = entries[definition.name];
    // A backend entry contributes presentation only; the source still owns
    // schema, availability and execution. Two executors must never overlap.
    if (ui !== undefined && ui.type !== "backend") throw new Error(`Tool name collision: "${definition.name}"`);
    toolkit[definition.name] = {
      type: "frontend",
      description: definition.description,
      parameters: definition.inputSchema,
      ...(ui?.display === undefined ? {} : { display: ui.display }),
      render: (ui?.render ?? ConversationDefaultTool) as never,
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
  // When a source becomes unavailable its backend renderer remains in entries,
  // preserving historical output without exposing an executable model tool.
  return toolkit;
}
