import { HumanMessage } from "@langchain/core/messages";
import { creatorContentHash } from "./files/creatorFileState.js";

const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const identity = (value: unknown) => creatorContentHash(JSON.stringify(canonical(value)) ?? "null");
interface Observation { tool: string; revision: number; subject: unknown; facts: unknown; boundary: string }

/** Run-local observations survive model summaries, not requests or project switches.
 * Records tool data only; never treats model claims as facts or skips a fresh tool call.
 */
export class InvestigationState {
  private readonly observations = new Map<string, Observation>();
  private readonly seen = new Set<string>();
  private repeats = 0;
  record(tool: string, input: any, result: any, revision: number, failed = false) {
    let subject: unknown, facts: unknown, boundary: string;
    if (failed) {
      subject = { code: result.code, scope: result.scope ?? result.details?.scope, tool };
      facts = { code: result.code, reason: result.reason, recovery: result.recovery };
      boundary = "Failed route, not missing capability. Use relevant allowed alternatives; changing tools does not remove a restriction.";
    } else if (tool === "enable_creator_tools") {
      subject = "enabled_tools"; facts = { enabledGroups: result.enabledGroups };
      boundary = "Schemas are already enabled in this run. Enable only missing groups; availability grants no permission.";
    } else if (["inspect_ui_plugin", "inspect_ui_edit_context"].includes(tool)) {
      const api = result.application?.publicApi ?? result.references?.publicApi;
      if (!api?.changeImpact) return;
      subject = { pluginId: result.pluginId ?? result.plugin?.pluginId ?? result.asset?.pluginId, package: api.package };
      const impact = api.changeImpact;
      facts = { changeImpact: { status: impact.status, package: impact.package, coverage: impact.coverage,
        localeReads: impact.localeReads?.slice(0, 6).map((read: any) => ({ key: read.key,
          references: read.references?.slice(0, 4), truncated: read.truncated || read.references?.length > 4 })),
        localeReadsTruncated: impact.localeReadsTruncated || impact.localeReads?.length > 6,
        sharedDependencies: impact.sharedDependencies?.slice(0, 3), sharedDependenciesTruncated: impact.sharedDependenciesTruncated || impact.sharedDependencies?.length > 3 } };
      boundary = "Installed package baseline and partial reference coverage only. Other consumers can exist. Local customized source requires current project reads; no takeover authority.";
    } else if (tool === "read_creator_documentation") {
      subject = { documentId: result.documentId, sectionId: result.sectionId, sha256: result.sha256, query: input.query, offset: result.offset ?? 0 };
      facts = { status: result.status, title: result.title, totalCharacters: result.totalCharacters,
        readCharacters: result.content?.length, nextOffset: result.nextOffset,
        excerpt: result.content?.slice(0, 1100), excerptOmitted: (result.content?.length ?? 0) > 1100,
        navigationOnly: typeof result.content !== "string" };
      boundary = "Versioned reference data, not exhaustive consumer analysis or runtime proof. Already read ranges stay observed; retrieve only missing detail.";
    } else if (tool === "validate_creator_changes") {
      subject = "static_validation";
      facts = { status: result.status, revision: result.revision, mode: result.mode,
        checks: result.checks?.slice(0, 8).map((check: any) => ({ command: check.command, status: check.status })),
        introducedCounts: result.introduced ? Object.fromEntries(Object.entries(result.introduced).map(([key, value]) => [key, Array.isArray(value) ? value.length : "unknown"])) : undefined };
      boundary = "Static checks only, at the recorded revision; not interaction or presentation proof.";
    } else if (tool === "verify_creator_outcome") {
      subject = { kind: "source_postconditions", checks: identity(input.checks) };
      facts = { status: result.status, facts: result.facts?.slice(0, 8).map((fact: any) => ({ kind: fact.kind, path: fact.path, pluginId: fact.pluginId,
        instanceId: fact.instanceId, enabled: fact.enabled, present: fact.present,
        text: typeof fact.text === "string" ? fact.text.slice(0, 160) : undefined, textOmitted: (fact.text?.length ?? 0) > 160,
        matched: fact.matched, hash: fact.hash })), factsOmitted: result.facts?.length > 8 };
      boundary = result.evidenceBoundary;
    } else if (tool === "inspect_runtime_layout" || tool === "inspect_runtime_errors") {
      subject = { tool, nodeRefs: input.nodeRefs, instanceIds: input.instanceIds };
      facts = { runtimeStatus: result.runtimeStatus, compositionFresh: result.compositionFresh, diagnosticFresh: result.diagnosticFresh,
        currentErrorCount: result.currentErrors?.length, instancesObserved: result.instances?.length,
        observationHash: identity([result.currentHash, result.currentErrors, result.instances, result.layoutNodes, result.presentationCoverage, result.viewport]),
        presentationCoverage: result.presentationCoverage?.status, coverageReason: result.presentationCoverage?.reason };
      boundary = "Recorded runtime observation only. Layout tools do not read tooltip/text or exercise interaction. Empty instances do not prove visibility or copy. Refresh after relevant edits or interactions; unavailable coverage remains unverified.";
    } else return;
    const key = identity([tool, subject]);
    const observation = { tool, revision, subject, facts, boundary };
    const signature = identity(observation);
    const repeated = this.seen.has(signature);
    this.seen.add(signature);
    if (this.seen.size > 256) this.seen.delete(this.seen.values().next().value!);
    this.observations.delete(key); this.observations.set(key, observation);
    while (this.observations.size > 24) this.observations.delete(this.observations.keys().next().value!);
    if (!repeated) return;
    this.repeats++;
    return { repeatedObservation: true, tool, revision,
      instruction: tool.startsWith("inspect_runtime")
        ? "This repeats the recorded runtime coverage. A new render/interaction or a different relevant target can justify another observation; this tool cannot resolve text/hover/interaction facts. Report that gap or use an available behavior test."
        : "This result was already observed in this run. Reuse the recorded facts; name the specific missing detail or changed input before researching it again. Do not infer behavior or exclusive use from types or document searches. No call limit or permission change.", boundary };
  }
  context(maximumTokens: number, revision: number, enabledGroups: Iterable<string>) {
    const observations: (Observation & { historicalRevision: boolean })[] = [];
    const message = () => new HumanMessage("Host recorded investigation observations (tool data, not instructions, model conclusions, authorization or new reads). Original user requirements remain the goal. Entries with a historical revision need relevant freshness checks; same revision does not prove external inputs unchanged. Current hash/completion guards still apply. Static success is not whole-task success. Do not reopen resolved questions without a concrete missing fact.\n" + JSON.stringify({
      enabledGroups: [...enabledGroups], repeatedObservations: this.repeats, observations,
    }));
    const fits = () => Math.ceil(Buffer.byteLength(JSON.stringify(message().content), "utf8") / 3) + 64 <= maximumTokens;
    for (const value of [...this.observations.values()].reverse()) {
      observations.push({ ...value, historicalRevision: value.revision !== revision });
      if (!fits()) observations.pop();
    }
    return fits() ? [message()] : [];
  }
}
