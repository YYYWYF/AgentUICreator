import type { AgentUISourceInspection } from "../../packages/project-control/src/project/types";

type SourceRequest = {
  operation: "inspect_agent_ui_sources" | "apply_agent_ui_source_item";
  input: Record<string, unknown>;
};
type SourceResponse = { ok: true; result: unknown } | {
  ok: false; error: { code: string; message: string };
};

/** Synchronize installed, unmodified plugins through the normal Source protocol. */
export async function ensureManagedHostPlugins(
  request: (request: SourceRequest) => Promise<SourceResponse>,
  { preserveCustomized = false }: { preserveCustomized?: boolean } = {},
): Promise<string[]> {
  const updated: string[] = [];
  const attempted = new Set<string>();
  const preserved = new Set<string>();
  for (;;) {
    const response = await request({ operation: "inspect_agent_ui_sources", input: {} });
    if (!response.ok) throw new Error(`${response.error.code}: ${response.error.message}`);
    const inspection = response.result as AgentUISourceInspection;
    const item = inspection.items.find(item => item.id.startsWith("plugin/") &&
      !preserved.has(item.id) &&
      item.status === "managed" && item.owned && item.updateAvailable);
    if (!item) return updated;
    if (attempted.has(item.id)) throw new Error(`Managed plugin upgrade did not advance ${item.id}`);
    attempted.add(item.id);
    const result = await request({ operation: "apply_agent_ui_source_item", input: {
      itemId: item.id, expectedStateHash: inspection.stateHash,
    } });
    if (!result.ok) {
      if (preserveCustomized && result.error.code === "AGENT_UI_SOURCE_CUSTOMIZED_DEPENDENCY") {
        preserved.add(item.id);
        console.warn(`Preserving ${item.id}: ${result.error.message}`);
        continue;
      }
      throw new Error(`Could not upgrade ${item.id}: ${JSON.stringify(result.error)}`);
    }
    const changed = (result.result as { changedItems?: string[] }).changedItems ?? [item.id];
    for (const id of changed) if (!updated.includes(id)) updated.push(id);
  }
}
