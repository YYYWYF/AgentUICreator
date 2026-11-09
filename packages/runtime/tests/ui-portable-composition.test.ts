import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createPluginCapabilityCatalog, createRuntimeCompositionStore } from "../src/ui/index.js";

const hash = (source: string) => createHash("sha256").update(source).digest("hex");
const compact = (source: string) => JSON.stringify(JSON.parse(source));
const first = '{\r\n  "root": { "type": "stack", "children": [] }\r\n}\r\n';
const next = '{\n  "root": { "type": "column", "children": [] }\n}\n';
const capabilityCatalog = createPluginCapabilityCatalog([]);
const revision = "a".repeat(64);
const descriptor = (source: string, id: string, catalog = revision) => JSON.stringify({
  transactionId: id, appUIModelHash: hash(source), appUIModelJsonHash: hash(compact(source)),
  capabilityCatalogRevision: catalog,
});

it("matches portable JSON imports to exact source identities and gates mixed transaction inputs", async () => {
  const store = createRuntimeCompositionStore();
  const candidate = { appUIModelSource: compact(first), capabilityCatalog, capabilityCatalogRevision: revision,
    revisionDescriptorSource: descriptor(first, "first") };
  store.stageCandidate(candidate);
  await vi.waitFor(() => expect(store.getSnapshot()?.transactionId).toBe("first"));
  expect(store.getSnapshot()?.appUIModelHash).toBe(hash(first));
  const published = store.getSnapshot();
  store.stageCandidate({ ...candidate, revisionDescriptorSource: descriptor(next, "next", "b".repeat(64)) });
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(store.getSnapshot()).toBe(published);
  store.stageCandidate({ ...candidate, appUIModelSource: compact(next),
    revisionDescriptorSource: descriptor(next, "next", "b".repeat(64)) });
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(store.getSnapshot()).toBe(published);
  store.stageCandidate({ ...candidate, appUIModelSource: compact(next), capabilityCatalogRevision: "b".repeat(64),
    revisionDescriptorSource: descriptor(next, "next", "b".repeat(64)) });
  await vi.waitFor(() => expect(store.getSnapshot()?.transactionId).toBe("next"));
  expect(store.getSnapshot()?.appUIModelHash).toBe(hash(next));
  const lastValid = store.getSnapshot();
  store.stageCandidate({ ...candidate, appUIModelSource: "invalid" });
  await vi.waitFor(() => expect(store.getCandidateDiagnostic()?.status).toBe("error"));
  expect(store.getSnapshot()).toBe(lastValid);
});

it("supports manual JSON edits without a descriptor and existing raw-source descriptors", async () => {
  const store = createRuntimeCompositionStore();
  const candidate = { appUIModelSource: compact(first), capabilityCatalog, capabilityCatalogRevision: revision };
  store.stageCandidate(candidate);
  await vi.waitFor(() => expect(store.getSnapshot()?.appUIModelHash).toBe(hash(compact(first))));
  store.stageCandidate({ ...candidate, appUIModelSource: compact(next) });
  await vi.waitFor(() => expect(store.getSnapshot()?.appUIModelHash).toBe(hash(compact(next))));
  store.stageCandidate({ ...candidate, appUIModelSource: first, revisionDescriptorSource: JSON.stringify({
    transactionId: "legacy", appUIModelHash: hash(first), capabilityCatalogRevision: revision,
  }) });
  await vi.waitFor(() => expect(store.getSnapshot()?.transactionId).toBe("legacy"));
});
