import { creatorContentHash as hash } from "./files/creatorFileState.js";

export class DebuggingEvidence {
  readonly observed = new Map<string, any>();
  readonly selected = new Set<string>();
  runtimeBaseline: Set<string> | undefined;
  runtimeCurrent: Set<string> | undefined;
  runtimeRevision: number | undefined;
  staticCurrent: Set<string> | undefined;
  staticRevision: number | undefined;
  observeStatic(result: any) {
    this.staticCurrent = new Set(result.diagnostics.map((item: any) => item.targetId));
    this.staticRevision = result.revision;
    for (const item of result.diagnostics) this.observed.set(item.targetId, { kind: "static", revision: result.revision, owner: { path: item.file }, repairResources: ["file:" + item.file], summary: item.message });
  }
  observeRuntime(result: any, revision: number) {
    if (!result.compositionFresh || !result.diagnosticFresh || result.summary.truncated) { this.runtimeCurrent = undefined; return; }
    const current = new Set<string>(result.currentErrors.map((item: any) => item.debuggingTargetId));
    if (revision === 0 && !this.runtimeBaseline) this.runtimeBaseline = current;
    this.runtimeCurrent = current; this.runtimeRevision = revision;
    if (revision !== 0 && !this.runtimeBaseline) return;
    for (const item of result.currentErrors) {
      const composition = ["runtime-composition", "plugin-width-incompatible"].includes(item.kind);
      const integration = ["application-event-unknown", "application-event-invalid-payload", "plugin-event-undeclared-subscription"].includes(item.kind);
      const resources = composition ? ["app-ui-model"] : integration ? ["agent-contract"] : item.kind === "application-gate" ? [] : item.pluginId ? ["plugin:" + item.pluginId] : [];
      this.observed.set(item.debuggingTargetId, { kind: "runtime", revision, owner: { pluginId: item.pluginId, instanceId: item.instanceId }, repairResources: resources, summary: `${item.pluginId ?? "application"} / ${item.kind}`, ownerEvidence: item });
    }
  }
  select(id: string, revision: number) {
    const item = this.observed.get(id);
    if (!item) throw new Error("DEBUGGING_TARGET_NOT_OBSERVED");
    const available = item.kind === "static" ? this.staticRevision === revision && this.staticCurrent?.has(id) : this.runtimeRevision === revision && this.runtimeCurrent?.has(id) && this.runtimeBaseline;
    if (!available) throw new Error("DEBUGGING_EVIDENCE_STALE");
    this.selected.add(id);
    return { status: "selected", targetId: id, ...item, ownerResolution: item.repairResources.length ? "resolved" : "DEBUGGING_OWNER_EVIDENCE_REQUIRED", nextAction: "inspect_owner_before_repair" };
  }
  assertPath(file: string, source: string) {
    if (!this.selected.size) return;
    const allowed = [...this.selected].flatMap(id => this.observed.get(id)?.repairResources ?? []);
    if (!allowed.some(resource => resource === "file:" + file || (resource.startsWith("plugin:") && file.startsWith(`${source}/plugins/${resource.slice(7)}/`)) || (resource === "agent-contract" && file.startsWith(`${source}/agent-contract/`)))) throw new Error("CREATOR_CHANGE_SCOPE_VIOLATION");
  }
  staticRemaining(current: Set<string>) { return [...this.selected].filter(id => id.startsWith("ts:") && current.has(id)); }
  runtimeView(result: any) {
    const selected = new Set([...this.selected].filter(id => id.startsWith("runtime:")));
    if (!selected.size || !this.runtimeBaseline) return result;
    const relevant = result.currentErrors.filter((item: any) => selected.has(item.debuggingTargetId) || !this.runtimeBaseline!.has(item.debuggingTargetId));
    return { ...result, currentErrors: relevant, workspaceWarnings: result.currentErrors.filter((item: any) => !relevant.includes(item)) };
  }
}

export const staticTargetId = (message: string) => "ts:" + hash(message);
