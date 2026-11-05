import { expect, it } from "vitest";
import { pluginInspectionSummary, projectInspectionSummary } from "../src/agent/inspection.js";
import { pluginDirectoryNavigation } from "../src/agent/plugin-directory.js";

it("preserves exact composition/hash and complete identity indexes without embedding every action plan", () => {
  const model = { hash: "observed-hash", layout: { nodeRef: "l0", type: "column", sizes: ["1fr"] }, slots: [{ ref: "s0" }] };
  const raw = { view: "composition", appUIModel: model, capabilityCatalogRevision: "catalog-hash", workspaceDiagnostics: [{ code: "existing-warning" }],
    creatorActions: { revision: "actions", candidates: Array.from({ length: 80 }, (_, i) => ({ actionId: `action-${i}`, kind: "add", status: "ready", target: { pluginId: `p${i}` }, plan: { description: "large plan".repeat(100) } })) },
    authoringTargetCatalog: { revision: "owners", candidates: [{ id: "owner", kind: "plugin_source", name: "Card", pluginId: "p0", intents: ["long intent"] }], bindings: [{ targetId: "owner", pluginId: "p0", ownerPath: "src/应用/plugins/p0/index.tsx", execution: "not navigation" }] },
    capabilitySummaries: [{ pluginId: "p0", name: "Card", selected: false, capabilities: ["card"], unsupportedGuesses: "not a contract" }] };
  const original = structuredClone(raw), summary = projectInspectionSummary(raw);
  expect(summary.appUIModel).toEqual(model);
  expect(summary.capabilityCatalogRevision).toBe("catalog-hash");
  expect(summary.workspaceDiagnostics).toEqual(raw.workspaceDiagnostics);
  expect(summary.creatorActions.candidates.map((item: any) => item.actionId)).toEqual(raw.creatorActions.candidates.map(item => item.actionId));
  expect(summary.authoringTargetCatalog.bindings[0]).toMatchObject({ ownerPath: "src/应用/plugins/p0/index.tsx", pluginId: "p0" });
  expect(JSON.stringify(summary).length).toBeLessThan(JSON.stringify(raw).length / 3);
  expect(summary.projection.fullResult.input.detail).toBe("full");
  expect(raw).toEqual(original);
});

it("keeps every prop name and the full query while deferring inherited DOM type expansions", () => {
  const raw = { application: { usageGuide: { currentExample: { source: "<Card />" }, customizationProps: ["expanded", "onCopy"] },
    publicApi: { status: "available", completePropNames: true, propNames: ["expanded", "onCopy"], props: [
      { name: "expanded", type: "boolean", inherited: false }, { name: "onCopy", type: "ClipboardEventHandler", inherited: true },
    ] } } };
  const summary = pluginInspectionSummary(raw, "card");
  expect(summary.application.publicApi.propNames).toEqual(["expanded", "onCopy"]);
  expect(summary.application.publicApi.props).toEqual([raw.application.publicApi.props[0]]);
  expect(summary.application.publicApi.inheritedDetailsOmitted).toBe(1);
  expect(summary.application.publicApi.fullResult.input).toEqual({ pluginId: "card", detail: "full" });
  expect(raw.application.publicApi.props).toHaveLength(2);
});

it("keeps the full Host directory unchanged while supplying a lighter model navigation index", () => {
  const directory = { plugins: [{ pluginId: "card", name: "卡片", targetNames: ["卡片"], state: "enabled", applicationPath: "/src/应用/card.tsx", instances: [{ id: "p0" }], defaultPlacement: { requires: "complete preflight" } }] };
  const navigation = pluginDirectoryNavigation(directory);
  expect(navigation.plugins[0]).toMatchObject({ pluginId: "card", targetNames: ["卡片"], instances: [{ id: "p0" }] });
  expect(navigation.plugins[0]).not.toHaveProperty("defaultPlacement");
  expect(directory.plugins[0]).toHaveProperty("defaultPlacement");
});
