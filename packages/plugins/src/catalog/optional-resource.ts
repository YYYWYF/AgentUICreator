import type { AgentUISourceItem } from "./types.js";

/** Deferred until custom components and native Surface bindings share one path. */
export function isAgentUISourceItemAvailable(id: string): boolean {
  return id !== "integration/a2ui";
}
export function isOptionalAgentUISourceItem(item: Pick<AgentUISourceItem, "kind"> & { id?: string }): boolean {
  return (item.id === undefined || isAgentUISourceItemAvailable(item.id)) && (item.kind === "demo" || item.kind === "integration");
}
