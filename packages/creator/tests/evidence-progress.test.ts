import { expect, it } from "vitest";
import { EvidenceProgress } from "../src/agent/evidence-progress.js";
import { ToolMessage } from "@langchain/core/messages";
import { CreatorContextArtifacts } from "../src/agent/context-artifacts.js";

it("recognizes covered ranges despite changed limits, new empty keywords and unrelated repeated reads", () => {
  const progress = new EvidenceProgress();
  const file = { path: "/src/中文.tsx", hash: "first", totalLines: 80, nextOffset: null };
  expect(progress.observe("read_file", { offset: 0, limit: 200 }, file, 0).newEvidence).toBe(true);
  expect(progress.observe("read_file", { offset: 10, limit: 20 }, { ...file, nextOffset: 30 }, 0).newEvidence).toBe(false);
  let last: ReturnType<EvidenceProgress["observe"]>;
  for (let index = 0; index < 5; index++) last = progress.observe("grep", { path: "/src", pattern: `missing-${index}` }, [], 0);
  expect(last!).toMatchObject({ newEvidence: false, unchangedReads: 6, recovery: { action: "review_stalled_investigation" } });
  expect(progress.observe("read_file", {}, { ...file, hash: "changed" }, 0)).toMatchObject({ newEvidence: true, unchangedReads: 0 });
});
it("merges adjacent observations and resets feedback after actual mutation without limiting long progress", () => {
  const progress = new EvidenceProgress();
  const file = { path: "/src/a.ts", hash: "first", totalLines: 100 };
  progress.observe("read_file", { offset: 0 }, { ...file, nextOffset: 20 }, 0);
  progress.observe("read_file", { offset: 20 }, { ...file, nextOffset: 40 }, 0);
  expect(progress.observe("read_file", { offset: 5 }, { ...file, nextOffset: 35 }, 0).newEvidence).toBe(false);
  expect(progress.observe("grep", {}, [], 1)).toMatchObject({ unchangedReads: 1 });
  for (let i = 0; i < 120; i++) expect(progress.observe("grep", { pattern: String(i) }, [`/src/file-${i}.tsx`], 1)).toMatchObject({ newEvidence: true, unchangedReads: 0 });
});
it("ignores telemetry and query wording but retains different directory scope and changed facts", () => {
  const progress = new EvidenceProgress();
  expect(progress.observe("inspect_ui_plugin", { pluginId: "a" }, { asset: { id: "a" }, observedAt: "1" }, 0).newEvidence).toBe(true);
  expect(progress.observe("inspect_ui_plugin", { pluginId: "a", query: "again" }, { asset: { id: "a" }, observedAt: "2", recovery: { count: 9 } }, 0).newEvidence).toBe(false);
  expect(progress.observe("ls", { path: "/a" }, [{ name: "index.tsx" }], 0).newEvidence).toBe(true);
  expect(progress.observe("ls", { path: "/b" }, [{ name: "index.tsx" }], 0).newEvidence).toBe(true);
});
it("does not count focus changes, suggested documents or repeated bundled source as implementation evidence", () => {
  const progress = new EvidenceProgress();
  const file = { path: "/src/界面/Card.tsx", hash: "card", content: "1: export const Card = 1;", totalLines: 1, nextOffset: null };
  const bundle = (id: string) => ({ target: { id: "card" }, plugin: { pluginId: "card" }, files: [file], references: { documentation: { entries: [{ documentId: id }] } } });
  expect(progress.observe("inspect_ui_edit_context", { focus: "service" }, bundle("service"), 0).newEvidence).toBe(true);
  for (let i = 0; i < 6; i++) {
    const result = progress.observe("inspect_ui_edit_context", { focus: String(i) }, bundle(String(i)), 0);
    expect(result.newEvidence).toBe(false);
    if (i === 5) expect(result.recovery?.action).toBe("review_stalled_investigation");
  }
  expect(progress.observe("read_file", {}, file, 0).newEvidence).toBe(false);
  expect(progress.observe("inspect_ui_edit_context", {}, { ...bundle("service"), files: [{ ...file, hash: "changed" }] }, 0).newEvidence).toBe(true);
});
it("distinguishes documentation navigation from actually read sections and continuations", () => {
  const progress = new EvidenceProgress();
  progress.observe("read_creator_documentation", {}, { status: "available", sourceDigest: "docs", entries: [{ documentId: "a" }] }, 0);
  expect(progress.observe("read_creator_documentation", {}, { status: "available", sourceDigest: "docs", entries: [{ documentId: "b" }] }, 0).newEvidence).toBe(false);
  const section = { status: "available", sourceDigest: "docs", documentId: "api", sha256: "v1", sectionId: "service", offset: 0, content: "a".repeat(100) };
  expect(progress.observe("read_creator_documentation", {}, section, 0).newEvidence).toBe(true);
  expect(progress.observe("read_creator_documentation", {}, { ...section, offset: 10, content: "a".repeat(20) }, 0).newEvidence).toBe(false);
  expect(progress.observe("read_creator_documentation", {}, { ...section, offset: 100 }, 0).newEvidence).toBe(true);
});
it("counts newly resolved installed symbols, not permutations or more guessed unavailable names", () => {
  const progress = new EvidenceProgress();
  const symbol = (name: string) => ({ name, status: "available", type: "() => void" });
  const result = (symbols: any[]) => ({ asset: { id: "card" }, sharedTypes: { module: "plugin", packageVersion: "1", status: "available", symbols } });
  expect(progress.observe("inspect_ui_plugin", {}, result([symbol("a"), symbol("b")]), 0).newEvidence).toBe(true);
  expect(progress.observe("inspect_ui_plugin", {}, result([symbol("b"), symbol("a"), { name: "guessed", status: "unavailable" }]), 0).newEvidence).toBe(false);
  expect(progress.observe("inspect_ui_plugin", {}, result([symbol("c")]), 0).newEvidence).toBe(true);
});
it("recognizes a mostly repeated investigation even when occasional new reads reset the consecutive counter", () => {
  const progress = new EvidenceProgress();
  progress.observe("read_file", {}, { path: "/src/owner.tsx", hash: "owner", totalLines: 20, nextOffset: null }, 0);
  let reviews = 0;
  for (let i = 0; i < 20; i++) {
    const result = i % 4 === 3
      ? progress.observe("read_file", {}, { path: `/src/other-${i}.ts`, hash: String(i), totalLines: 1, nextOffset: null }, 0)
      : progress.observe("read_file", { limit: i + 30 }, { path: "/src/owner.tsx", hash: "owner", totalLines: 20, nextOffset: null }, 0);
    if (result.recovery) reviews++;
  }
  expect(reviews).toBeGreaterThan(0);
});
it("reuses complete composition facts across full and summary projections while noticing actual source changes", () => {
  const progress = new EvidenceProgress();
  const base = { view: "composition", appUIModel: { hash: "same", slots: [] }, pluginSources: [{ pluginId: "card", hash: "source" }] };
  expect(progress.observe("inspect_ui_project", {}, { ...base, capabilities: ["a"] }, 0).newEvidence).toBe(true);
  expect(progress.observe("inspect_ui_project", {}, { ...base, projection: { detail: "summary" } }, 0).newEvidence).toBe(false);
  expect(progress.observe("inspect_ui_project", {}, { ...base, pluginSources: [{ pluginId: "card", hash: "changed" }] }, 0).newEvidence).toBe(true);
});

it("does not count pagination or JSON projections of an already observed archive as new evidence", () => {
  const progress = new EvidenceProgress(), artifacts = new CreatorContextArtifacts();
  const source = { path: "/skills/authoring.md", hash: "same", totalLines: 300, nextOffset: null, content: "合同🌟\n".repeat(5000) };
  progress.observe("read_file", {}, source, 0);
  const archive = artifacts.archive(new ToolMessage({ tool_call_id: "original", content: JSON.stringify({ ok: true, result: source }) }), "read_file")!;
  for (const offset of [0, 8000, 16000]) {
    const result = artifacts.read(archive.artifactId, ["result", "content"], offset, 8000);
    expect(progress.observe("read_creator_context", {}, result, 0).newEvidence).toBe(false);
  }
  expect(progress.observe("read_creator_context", {}, artifacts.read(archive.artifactId, ["result"]), 1).newEvidence).toBe(false);
  expect(progress.observe("read_file", {}, { ...source, hash: "actual-source-change" }, 1).newEvidence).toBe(true);
});

it("reviews a growing investigation without blocking new facts, and respects read-only work", () => {
  const progress = new EvidenceProgress();
  let reviews = 0;
  for (let i = 0; i < 150; i++) {
    const observed = progress.observe("read_file", {}, { path: `C:\\项目\\facts-${i}.ts`, hash: String(i), totalLines: 1, nextOffset: null }, 0, true);
    expect(observed.newEvidence).toBe(true);
    if (observed.recovery) {
      reviews++;
      expect(observed.recovery).toMatchObject({ reason: "investigation_without_mutation" });
      expect(observed.recovery.instruction).toContain("Stay read-only");
      expect(observed.recovery.instruction).toContain("does not require mutation or limit further calls");
    }
  }
  expect(reviews).toBeGreaterThan(0);
  expect(progress.observe("grep", {}, ["new"], 1).recovery).toBeUndefined();
});
