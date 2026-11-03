import { readFile } from "node:fs/promises";
import { z } from "zod";
import { inspectProject } from "./inspection.js";
import { editingProjectIdentity } from "./editing-session.js";
import { resolveReadPath } from "./project-read.js";
import { creatorContentHash } from "./files/creatorFileState.js";
import type { ToolContext } from "./tools.js";

export const creatorPostconditions = z.array(z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("plugin_enabled"), pluginId: z.string().min(1), enabled: z.boolean(), instanceId: z.string().min(1).optional() }),
  z.object({ kind: z.literal("file_text"), path: z.string().min(1), text: z.string().min(1).max(120000), present: z.boolean().default(true) }),
])).min(1).max(16);
export type CreatorPostcondition = z.infer<typeof creatorPostconditions>[number];

/** Exact, read-only goal facts. These are neither runtime tests nor mutation grants. */
export async function checkCreatorPostconditions(context: ToolContext, checks: CreatorPostcondition[]) {
  context.signal.throwIfAborted();
  const identity = await editingProjectIdentity(context.root);
  const project = checks.some(check => check.kind === "plugin_enabled") ? await inspectProject(context, { view: "composition" }) : undefined;
  if (project && (!Array.isArray(project.capabilitySummaries) || !Array.isArray(project.pluginInstances) || !project.appUIModel?.hash)) throw new Error("CREATOR_OUTCOME_EVIDENCE_UNAVAILABLE");
  const files = new Map<string, { path: string; hash: string }>();
  const textFile = async (file: string) => {
    const location = await resolveReadPath(context, file);
    if (location.skill) throw new Error("TOOL_PERMISSION_DENIED");
    const bytes = await readFile(location.target), content = bytes.toString("utf8");
    if (bytes.length > 1_000_000 || content.includes("\0") || !Buffer.from(content).equals(bytes)) throw new Error("CREATOR_TEXT_FILE_REQUIRED");
    return { content, hash: creatorContentHash(bytes), path: location.name };
  };
  const facts = [];
  for (const check of checks) {
    context.signal.throwIfAborted();
    if (check.kind === "plugin_enabled") {
      const known = project!.capabilitySummaries.some((item: any) => item.pluginId === check.pluginId) || project!.pluginInstances.some((item: any) => item.pluginId === check.pluginId);
      const instances = project!.pluginInstances.filter((item: any) => item.pluginId === check.pluginId && (!check.instanceId || item.id === check.instanceId));
      const enabled = instances.filter((item: any) => item.effectiveEnabled ?? item.enabled !== false).map((item: any) => item.id);
      const matched = known && (!check.instanceId || instances.length > 0) && (check.enabled ? enabled.length > 0 : enabled.length === 0);
      facts.push({ ...check, matched, known, instanceIds: instances.map((item: any) => item.id), enabledInstanceIds: enabled });
    } else {
      const file = await textFile(check.path);
      files.set(file.path, { path: file.path, hash: file.hash });
      facts.push({ ...check, matched: file.content.includes(check.text) === check.present, hash: file.hash });
    }
  }
  // Recheck actual inputs rather than trusting a cached successful receipt.
  for (const file of files.values()) if ((await textFile(file.path)).hash !== file.hash) throw new Error("CREATOR_OUTCOME_EVIDENCE_STALE");
  if (project) {
    const current = await inspectProject(context, { view: "composition" });
    if (current.appUIModel?.hash !== project.appUIModel.hash || current.capabilityCatalogRevision !== project.capabilityCatalogRevision) throw new Error("CREATOR_OUTCOME_EVIDENCE_STALE");
  }
  if (await editingProjectIdentity(context.root) !== identity) throw new Error("CREATOR_OUTCOME_EVIDENCE_STALE");
  return { status: facts.every(fact => fact.matched) ? "satisfied" : "not_satisfied", facts,
    evidenceBoundary: "Exact current source/composition conditions only; not runtime behavior, validation or mutation authorization." };
}
