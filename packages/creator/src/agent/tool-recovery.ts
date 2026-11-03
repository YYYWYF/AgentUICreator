/** Recovery data describes existing read paths; it never grants access. */
export function readDenied(reason: string, scope: string) {
  return Object.assign(new Error(`TOOL_PERMISSION_DENIED: ${reason}`), {
    code: "TOOL_PERMISSION_DENIED", reason, scope,
    recovery: { action: "use_allowed_read_entry", retryable: false,
      alternatives: [
        { tool: "inspect_ui_edit_context", purpose: "Locate project-owned source and installed public API references" },
        { tool: "inspect_ui_plugin", purpose: "Use pluginId and returned sharedModule/sharedSymbols queries for installed public declarations" },
        { tool: "ls", input: { path: "/" }, purpose: "Discover virtual project paths; operating-system paths are not accepted" },
      ],
      interpretation: "Do not retry this protected area through another file tool. Read access and source takeover are separate from write authority." },
  });
}

/** Share failures across ls/glob/grep/read_file, independently of unrelated reads. */
export class ToolRecovery {
  private readonly failures = new Map<string, number>();
  private readonly emptySearches = new Map<string, Set<string>>();
  private readonly fileRanges = new Map<string, { ranges: [number, number][]; repeats: number }>();
  private readonly frameworkReads = new Map<number, Set<string>>();
  private guidance: unknown;
  recordGuidance(value: unknown) { this.guidance = value; }
  takeGuidance() { const value = this.guidance; this.guidance = undefined; return value; }
  file(path: string, hash: string, start: number, end: number, revision: number, liveObservation = false) {
    let route: unknown;
    if (liveObservation && path.split("/").some(part => ["runtime", "framework"].includes(part.toLowerCase()))) {
      const files = this.frameworkReads.get(revision) ?? new Set<string>(); files.add(path); this.frameworkReads.set(revision, files);
      if (this.frameworkReads.size > 50) this.frameworkReads.delete(this.frameworkReads.keys().next().value!);
      if (files.size === 3) {
        route = { action: "observe_rendered_layout_if_needed", tool: "inspect_runtime_layout", toolGroup: "debugging",
          instruction: "Several generated Runtime/framework files have been inspected. For unresolved rendered DOM/container, mode-attribute or size facts, enable debugging alone and use inspect_runtime_layout. It provides actual structure and computed styles; do not keep tracing implementation files to guess these facts. Source reads for a concrete contract/source defect remain allowed. No permission has changed." };
        this.guidance = route;
      }
    }
    const key = JSON.stringify([path, hash, revision]), saved = this.fileRanges.get(key) ?? { ranges: [], repeats: 0 };
    const covered = saved.ranges.some(([from, to]) => from <= start && to >= end);
    if (!covered) { saved.ranges.push([start, end]); saved.repeats = 0; }
    else saved.repeats++;
    this.fileRanges.set(key, saved);
    if (this.fileRanges.size > 200) this.fileRanges.delete(this.fileRanges.keys().next().value!);
    if (saved.repeats < 2) return route;
    const recovery = { action: "reuse_observed_file", path, repeatedUnchangedReads: saved.repeats,
      instruction: "This unchanged range was read in this run; its evidence remains recorded and edits check current hashes. Reuse it. Query only a concrete missing public contract. New project-owned behavior may be designed within authorization and validated after implementation; its absence in current source is expected. Protected paths and takeover permissions have not changed." };
    if (saved.repeats === 2 || saved.repeats === 4) this.guidance = recovery;
    return recovery;
  }
  failure(error: any) {
    if (!error.recovery) return undefined;
    const key = JSON.stringify([error.code, error.reason, error.scope]);
    const attempts = (this.failures.get(key) ?? 0) + 1;
    this.failures.set(key, attempts);
    if (this.failures.size > 200) this.failures.delete(this.failures.keys().next().value!);
    const recovery = { ...error.recovery, attempts, ...(attempts > 1 ? {
      repeatedFailure: true,
      routeInstruction: "This evidence route failed again. Use a returned alternative or report the precise missing fact; changing keywords or file tools does not remove this restriction.",
    } : {}) };
    if (attempts === 2 || attempts === 4) this.guidance = recovery;
    return recovery;
  }
  search(name: string, input: any, result: any, revision: number) {
    if (!["glob", "grep"].includes(name) || !Array.isArray(result)) return undefined;
    const key = JSON.stringify([input.path ?? "/", revision]);
    if (result.length) { this.emptySearches.delete(key); return undefined; }
    const queries = this.emptySearches.get(key) ?? new Set<string>();
    queries.add(JSON.stringify([name, input.pattern, input.glob]));
    this.emptySearches.set(key, queries);
    if (this.emptySearches.size > 200) this.emptySearches.delete(this.emptySearches.keys().next().value!);
    const recovery = queries.size >= 4 ? { action: "change_evidence_route", emptySearches: queries.size,
      instruction: "Several different searches in this scope returned no evidence. This does not prove a public capability is absent. Use inspect_ui_edit_context or installed public API inspection; if those cannot resolve it, report the missing fact rather than guessing." } : undefined;
    if (queries.size === 4) this.guidance = recovery;
    return recovery;
  }
}

/** Keep code/content/credentials out of telemetry while retaining read identities. */
export function toolReadIdentity(name: string, input: any) {
  if (!/^(inspect_|read_file$|ls$|glob$|grep$)/u.test(name)) return undefined;
  return Object.fromEntries(["file_path", "path", "pluginId", "targetId", "nodeRefs", "instanceIds", "sharedModule", "sharedSymbols"]
    .filter(key => input[key] !== undefined).map(key => [key, input[key]]));
}
