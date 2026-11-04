import { creatorContentHash } from "./files/creatorFileState.js";

const telemetry = new Set(["recovery", "observedAt", "receivedAt", "capturedAt", "inspectedAt", "generatedAt", "lastSeenAt", "requestId"]);
const fingerprint = (value: unknown) => creatorContentHash(JSON.stringify(value, (key, item) => telemetry.has(key) ? undefined : item));
const navigation = new Set(["documentation", "nextRead", "nextEvidence", "interpretation", "queryResolution", "statusMeaning", "projection", "observationCoverage"]);
function facts(value: any): any {
  if (Array.isArray(value)) return value.map(facts);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !navigation.has(key) && !telemetry.has(key)).map(([key, item]) => [key, facts(item)]));
}

/** Measures newly observed data, not how many distinct questions were asked. No execution cap. */
export class EvidenceProgress {
  private readonly known = new Set<string>();
  private readonly ranges = new Map<string, [number, number][]>();
  private revision = -1;
  private unchangedReads = 0;
  private recentReads: boolean[] = [];
  private lastReview = -1;
  private reads = 0;

  observe(name: string, input: any, result: any, revision: number) {
    if (revision !== this.revision) { this.revision = revision; this.unchangedReads = 0; this.recentReads = []; this.lastReview = -1; this.reads = 0; }
    let newEvidence = false;
    const remember = (value: unknown) => {
      const key = fingerprint(value);
      if (!this.known.has(key)) { this.known.add(key); newEvidence = true; }
      if (this.known.size > 4000) this.known.delete(this.known.values().next().value!);
    };
    const inspectionFacts = (value: any) => {
      for (const contract of [value?.sharedTypes, value?.application?.sharedTypes, value?.references?.sharedTypes]) {
        if (!contract) continue;
        remember(["installed-module", contract.module, contract.packageVersion, contract.status]);
        for (const symbol of contract.symbols ?? []) if (symbol.status === "available") remember(["installed-symbol", contract.module, contract.packageVersion, facts(symbol)]);
      }
      return facts({ ...value, sharedTypes: undefined,
        ...(value?.application ? { application: { ...value.application, sharedTypes: undefined } } : {}),
        ...(value?.references ? { references: { ...value.references, sharedTypes: undefined } } : {}) });
    };
    const range = (key: string, start: number, end: number) => {
      if (!Number.isFinite(end)) return;
      const ranges = this.ranges.get(key) ?? [];
      if (!this.ranges.has(key) || !ranges.some(([from, to]) => from <= start && to >= end)) newEvidence = true;
      const merged: [number, number][] = [...ranges, [start, end] as [number, number]].sort((a, b) => a[0] - b[0]);
      const covered: [number, number][] = [];
      for (const range of merged) {
        const previous = covered.at(-1);
        if (previous && previous[1] >= range[0]) previous[1] = Math.max(previous[1], range[1]);
        else covered.push([...range]);
      }
      this.ranges.set(key, covered);
      if (this.ranges.size > 1000) this.ranges.delete(this.ranges.keys().next().value!);
    };
    const source = (file: any, offset = 0) => {
      if (typeof file?.path === "string" && typeof file.hash === "string") {
        range(fingerprint([file.path.replace(/\\/gu, "/").replace(/^\//u, ""), file.hash]), offset, file.nextOffset ?? file.totalLines);
      }
    };
    if (name === "read_file") source(result, input.offset ?? 0);
    else if (name === "inspect_ui_edit_context" && Array.isArray(result?.files)) {
      for (const file of result.files) source(file);
      // Suggestions/coverage navigation can change with focus while every
      // source hash, API and composition fact remains identical.
      remember([name, inspectionFacts({ target: result.target, plugin: result.plugin, references: result.references })]);
    } else if (name === "inspect_ui_plugin") {
      remember([name, inspectionFacts(result)]);
    } else if (name === "inspect_ui_project") {
      // A summary projection of an already inspected model is not a new fact.
      // Remember individual fields so a genuine added source/contract fact still counts.
      const visit = (value: any, path: string[]) => {
        if (Array.isArray(value)) for (const item of value) visit(item, [...path, typeof item === "object" && item ? String(item.pluginId ?? item.instanceId ?? item.id ?? "item") : "item"]);
        else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) { if (key !== "view") visit(item, [...path, key]); }
        else remember([name, path, value]);
      };
      visit(facts(result), []);
    } else if (name === "read_creator_documentation") {
      if (typeof result?.content === "string" && result.sectionId) {
        range(fingerprint([name, result.documentId, result.sha256, result.sectionId]), result.offset ?? 0, (result.offset ?? 0) + result.content.length);
      }
      // Index entries and TOCs are navigation; finding a different link is
      // not equivalent to reading another API/implementation fact.
    } else if (Array.isArray(result)) {
      // A new empty-search keyword is not new evidence. Matched facts can be
      // reused across queries; directory entry names remain scoped to their path.
      for (const item of result) remember([name, name === "ls" ? input.path ?? "/" : null, item]);
    } else remember([name, facts(result)]);
    this.unchangedReads = newEvidence ? 0 : this.unchangedReads + 1;
    this.reads++;
    this.recentReads.push(newEvidence);
    if (this.recentReads.length > 16) this.recentReads.shift();
    const repeatedReads = this.recentReads.filter(value => !value).length;
    const mixedStall = this.recentReads.length >= 12 && repeatedReads >= Math.ceil(this.recentReads.length * 0.75);
    const review = (this.unchangedReads > 0 && this.unchangedReads % 6 === 0) || (mixedStall && this.reads - this.lastReview >= 6);
    if (review) this.lastReview = this.reads;
    const recovery = review ? {
      action: "review_stalled_investigation", unchangedReads: this.unchangedReads, revision,
      recentReads: this.recentReads.length, repeatedReads,
      instruction: "These reads added no new evidence. Same-run source observations remain recorded; edits check current hashes. Reuse the known contracts. Distinguish an unknown public API from project-owned behavior that needs implementation and later validation. Continue within authorization, or identify the exact missing external fact. No permissions or verification results changed.",
    } : undefined;
    return { newEvidence, unchangedReads: this.unchangedReads, ...(recovery ? { recovery } : {}) };
  }
}
