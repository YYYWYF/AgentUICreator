import { applyProductAdaptations } from "../scripts/sync-product-adapters.mjs";
import { readFileSync } from "node:fs";
import { mkdtemp, copyFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { adaptQuoteSelectionSource, QUOTE_SELECTION_FILES, installedVendorEntry } from "../scripts/sync-assistant-ui-upstream.mjs";
import { collectQuoteSelectionErrors } from "../scripts/check-assistant-ui-upstream.mjs";
import { quoteSelectionIntegrationReport } from "../../../scripts/generate-assistant-ui-upgrade-report.mjs";
const internal = new URL("../src/internal/", import.meta.url);
const record = JSON.parse(readFileSync(new URL("quote-selection-UPSTREAM.json", internal), "utf8"));
const upstream = source => readFileSync(new URL(`fixtures/quote-upstream/${source.split("/").at(-1)}`, import.meta.url), "utf8");
// Checked-in fixtures exercise mechanical adaptation regression. Current revision
// freshness is owned by sync + collectQuoteSelectionErrors, not these fixtures.
it("mechanically adapts the frozen selection fixtures without changing their algorithm", () => {
  for (const entry of QUOTE_SELECTION_FILES) {
    const source = upstream(entry.upstreamPath);
    const installed = readFileSync(new URL(entry.localPath, internal), "utf8");
    const adapted = adaptQuoteSelectionSource(source, entry.localPath);
    expect(adapted).toBe(installed);
    if (entry.localPath === "quote-selection-message-id.ts") expect(adapted).toBe(source);
    if (entry.localPath === "quote-selection-root.tsx") {
      const begin = value => value.slice(value.indexOf("    // Read the selection"), value.indexOf("  if (!info"));
      expect(begin(adapted)).toBe(begin(source));
      expect(adapted).toContain("    portalContainer,");
      expect(adapted).not.toContain("    document.body,");
    }
    if (entry.localPath === "quote-selection-action.tsx") {
      const begin = value => value.slice(value.indexOf("  const handleClick"));
      expect(begin(adapted)).toBe(begin(source));
    }
  }
});

it.each([
  ["quote-selection-root.tsx", "SelectionToolbarRoot.tsx", '    document.body,'],
  ["quote-selection-root.tsx", "SelectionToolbarRoot.tsx", 'import { useThreadRootElementRef } from "../thread/ThreadRootElementContext";\n'],
  ["quote-selection-action.tsx", "SelectionToolbarQuote.tsx", 'import { useAui } from "@assistant-ui/store";'],
])("fails loudly when an approved substitution changes in %s", (localPath, fixture, anchor) => {
  const source = upstream(fixture);
  for (const changed of [source.replace(anchor, "changed upstream shape"), source + anchor]) {
    expect(() => adaptQuoteSelectionSource(changed, localPath))
      .toThrow("Quote selection upstream adaptation requires review");
  }
});

it("sync replays the Quote Element import adaptation and fails on upstream drift", () => {
  const localPath = "components/assistant-ui/elements/quote.aui.tsx";
  const upstreamPath = `packages/ui/src/components/react/assistant-ui/elements/quote.aui.tsx`;
  const source = upstream(upstreamPath);
  const entry = installedVendorEntry({ source, localPath, upstreamPath });
  expect(entry.installed).toBe(readFileSync(new URL(`vendor/assistant-ui/${localPath}`, internal), "utf8"));
  expect(applyProductAdaptations(entry.installed, localPath)).toContain('import { SelectionToolbarPrimitive } from "../../../../../quote-selection-adapter.js";');
  expect(entry.provenance.adaptations).not.toContain("agent-ui-quote-selection-portal-bridge");
  expect(() => applyProductAdaptations(source + "\n  SelectionToolbarPrimitive,\n", localPath)).toThrow();
  expect(() => applyProductAdaptations(source.replace("  SelectionToolbarPrimitive,", "  ChangedSelectionPrimitive,"), localPath)).toThrow();
});


it("guards installed Quote sources, exact mappings and current vendor revision", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "quote-selection-guard-"));
  const provenancePath = path.join(root, "quote-selection-UPSTREAM.json");
  try {
    for (const entry of QUOTE_SELECTION_FILES) {
      await copyFile(new URL(entry.localPath, internal), path.join(root, entry.localPath));
    }
    await writeFile(provenancePath, JSON.stringify(record));
    const vendor = JSON.parse(readFileSync(new URL("vendor/assistant-ui/UPSTREAM.json", internal), "utf8"));
    expect(await collectQuoteSelectionErrors(root, vendor.revision)).toEqual([]);
    expect(await collectQuoteSelectionErrors(root, "0".repeat(40)))
      .toContain("quote-selection-UPSTREAM.json.revision must match UPSTREAM.json.revision.");
    const wrongPaths = structuredClone(record);
    wrongPaths.files[0].upstreamPath = "packages/react/src/other.tsx";
    await writeFile(provenancePath, JSON.stringify(wrongPaths));
    expect((await collectQuoteSelectionErrors(root, record.revision)).join("\n"))
      .toContain("exactly the three approved");
    await writeFile(provenancePath, JSON.stringify(record));
    await writeFile(path.join(root, "quote-selection-action.tsx"), "drift");
    expect(await collectQuoteSelectionErrors(root, record.revision))
      .toContain("Quote selection adapter modified: quote-selection-action.tsx.");
    await rm(path.join(root, "quote-selection-root.tsx"));
    expect(await collectQuoteSelectionErrors(root, record.revision))
      .toContain("Quote selection adapter missing: quote-selection-root.tsx.");
    await rm(provenancePath);
    expect(await collectQuoteSelectionErrors(root, record.revision))
      .toContain("quote-selection-UPSTREAM.json is missing.");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("flags all four upstream Quote seams and unavailable change sets for review", () => {
  const upstreamPaths = [
    "packages/ui/src/components/react/assistant-ui/elements/quote.aui.tsx",
    ...QUOTE_SELECTION_FILES.map(entry => entry.upstreamPath),
  ];
  for (const upstreamPath of upstreamPaths) {
    expect(quoteSelectionIntegrationReport([], [upstreamPath])).toMatchObject({
      status: "REVIEW REQUIRED", upstreamChangedFiles: [upstreamPath],
    });
  }
  expect(quoteSelectionIntegrationReport([], [])).toMatchObject({ status: "UNCHANGED" });
  expect(quoteSelectionIntegrationReport([], null)).toMatchObject({ status: "REVIEW REQUIRED" });
  expect(quoteSelectionIntegrationReport(["packages/react/src/internal/quote-selection-root.tsx"], []))
    .toMatchObject({ status: "REVIEW REQUIRED" });
});
