import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { installedVendorEntry } from "../scripts/sync-assistant-ui-upstream.mjs";
const internal = new URL("../src/internal/", import.meta.url);
const record = JSON.parse(readFileSync(new URL("quote-selection-UPSTREAM.json", internal), "utf8"));
const sha = value => createHash("sha256").update(value).digest("hex");
const upstream = source => readFileSync(new URL(`fixtures/quote-upstream/${source.split("/").at(-1)}`, import.meta.url), "utf8");
it("retains the frozen selection algorithm and records the exact primitive adaptation", () => {
  for (const entry of record.files) {
    const source = upstream(entry.upstreamPath);
    const installed = readFileSync(new URL(entry.localPath, internal), "utf8");
    expect(sha(source)).toBe(entry.upstreamSha256);
    expect(sha(installed)).toBe(entry.installedSha256);
    if (entry.localPath === "quote-selection-message-id.ts") expect(installed).toBe(source);
    if (entry.localPath === "quote-selection-root.tsx") {
      const begin = value => value.slice(value.indexOf("    // Read the selection"), value.indexOf("  if (!info"));
      expect(begin(installed)).toBe(begin(source));
      expect(installed).toContain("    portalContainer,");
      expect(installed).not.toContain("    document.body,");
    }
  }
});
it("sync replays the Quote Element import adaptation and fails on upstream drift", () => {
  const localPath = "components/assistant-ui/elements/quote.aui.tsx";
  const upstreamPath = `packages/ui/src/components/react/assistant-ui/elements/quote.aui.tsx`;
  const source = upstream(upstreamPath);
  const entry = installedVendorEntry({ source, localPath, upstreamPath });
  expect(entry.installed).toBe(readFileSync(new URL(`vendor/assistant-ui/${localPath}`, internal), "utf8"));
  expect(entry.installed).toContain('import { SelectionToolbarPrimitive } from "../../../../../quote-selection-adapter.js";');
  expect(entry.provenance.adaptations).toContain("agent-ui-quote-selection-portal-bridge");
  expect(() => installedVendorEntry({ source: source + "\n  SelectionToolbarPrimitive,\n", localPath, upstreamPath })).toThrow();
  expect(() => installedVendorEntry({ source: source.replace("  SelectionToolbarPrimitive,", "  ChangedSelectionPrimitive,"), localPath, upstreamPath })).toThrow();
});
