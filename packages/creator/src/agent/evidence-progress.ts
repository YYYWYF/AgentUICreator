import { creatorContentHash } from "./files/creatorFileState.js";

const telemetry = new Set(["recovery", "observedAt", "receivedAt", "capturedAt", "inspectedAt", "generatedAt", "lastSeenAt", "requestId"]);
const fingerprint = (value: unknown) => creatorContentHash(JSON.stringify(value, (key, item) => telemetry.has(key) ? undefined : item));

/** Measures newly observed data, not how many distinct questions were asked. No execution cap. */
export class EvidenceProgress {
  private readonly known = new Set<string>();
  private readonly ranges = new Map<string, [number, number][]>();
  private revision = -1;
  private unchangedReads = 0;

  observe(name: string, input: any, result: any, revision: number) {
    if (revision !== this.revision) { this.revision = revision; this.unchangedReads = 0; }
    let newEvidence = false;
    const remember = (value: unknown) => {
      const key = fingerprint(value);
      if (!this.known.has(key)) { this.known.add(key); newEvidence = true; }
      if (this.known.size > 4000) this.known.delete(this.known.values().next().value!);
    };
    if (name === "read_file" && typeof result?.path === "string" && typeof result.hash === "string") {
      const key = fingerprint([result.path, result.hash]);
      const start = input.offset ?? 0, end = result.nextOffset ?? result.totalLines;
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
    } else if (name === "read_creator_documentation" && Array.isArray(result?.entries)) {
      // Changing query words alone does not establish new documentation facts.
      for (const entry of result.entries) remember([name, entry.documentId, entry.sha256]);
    } else if (Array.isArray(result)) {
      // A new empty-search keyword is not new evidence. Matched facts can be
      // reused across queries; directory entry names remain scoped to their path.
      for (const item of result) remember([name, name === "ls" ? input.path ?? "/" : null, item]);
    } else remember([name, result]);
    this.unchangedReads = newEvidence ? 0 : this.unchangedReads + 1;
    const recovery = this.unchangedReads > 0 && this.unchangedReads % 6 === 0 ? {
      action: "review_stalled_investigation", unchangedReads: this.unchangedReads, revision,
      instruction: "These reads added no new evidence. Same-run source observations remain recorded; edits check current hashes. Reuse the known contracts. Distinguish an unknown public API from project-owned behavior that needs implementation and later validation. Continue within authorization, or identify the exact missing external fact. No permissions or verification results changed.",
    } : undefined;
    return { newEvidence, unchangedReads: this.unchangedReads, ...(recovery ? { recovery } : {}) };
  }
}
