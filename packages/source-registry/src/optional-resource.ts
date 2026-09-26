import type { AgentUISourceItem } from "./types.js";

export function isOptionalAgentUISourceItem(item: Pick<AgentUISourceItem, "kind">): boolean {
  return item.kind === "demo" || item.kind === "integration";
}
