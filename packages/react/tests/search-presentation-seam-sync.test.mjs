import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { applySearchPresentationLabels, installedVendorEntry, SEARCH_LABELS_SEAM_FILES, SEARCH_LABELS_SEAM_ID } from "../scripts/sync-assistant-ui-upstream.mjs";

const web = '  searching,\n  cycle: number;\n            Searching\n            Read 3 sources\n';
const retrieval = '  searching,\n  searching: boolean;\n            Retrieving\n            {chunks.length} passages above threshold\naria-label={`${chunk.source} relevance score`}\naria-valuetext={`${chunk.score.toFixed(2)} of 1.00`}';

it("replays the explicit labels seam and records adaptation hashes", () => {
  for (const file of SEARCH_LABELS_SEAM_FILES) {
    const source = file.endsWith("web-search.tsx") ? web : retrieval;
    const entry = installedVendorEntry({ source, localPath: file, upstreamPath: `upstream/${file}` });
    expect(entry.provenance.adaptations).toContain(SEARCH_LABELS_SEAM_ID);
    expect(entry.installed).toContain("labels?:");
    expect(entry.installed).toContain('labels?.complete.replace("{count}"');
    expect(entry.provenance.installedSha256).toBe(createHash("sha256").update(entry.installed).digest("hex"));
    if (file.endsWith("retrieval-chunks.tsx")) {
      expect(entry.installed).toContain('labels?.relevance.replace("{source}", chunk.source)');
      expect(entry.installed).toContain('labels?.score.replace("{score}", chunk.score.toFixed(2))');
    }
  }
});
it("requires explicit review when upstream label anchors change or become ambiguous", () => {
  const path = "components/assistant-ui/elements/web-search.tsx";
  expect(() => applySearchPresentationLabels(web.replace("Searching", "Looking up"), path)).toThrow(/Review the upstream labels seam/);
  expect(() => applySearchPresentationLabels(web + '            Searching\n', path)).toThrow(/expected exactly one/);
  expect(applySearchPresentationLabels("unrelated", "components/other.tsx")).toBe("unrelated");
});
it("tracks only the approved Element files and removes implicit tree contracts", async () => {
  const vendor = new URL("../src/internal/vendor/assistant-ui/", import.meta.url);
  const provenance = JSON.parse(await readFile(new URL("UPSTREAM.json", vendor), "utf8"));
  expect(provenance.patches.filter(p => p.id === SEARCH_LABELS_SEAM_ID)).toEqual([{
    id: SEARCH_LABELS_SEAM_ID, files: SEARCH_LABELS_SEAM_FILES, reason: expect.any(String),
  }]);
  const facade = await readFile(new URL("../src/internal/search-elements.tsx", import.meta.url), "utf8");
  expect(facade).not.toMatch(/children\[|cloneElement|localizeMeters|relevance score|of 1\\\.00/);
  expect(facade).toContain("labels={labels}");
});
