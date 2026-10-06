import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { applySearchPresentationLabels, SEARCH_LABELS_SEAM_FILES, SEARCH_LABELS_SEAM_ID } from "../scripts/sync-product-adapters.mjs";

const web = '  searching,\n  cycle: number;\n            Searching\n            Read 3 sources\n';
const retrieval = '  searching,\n  searching: boolean;\n            Retrieving\n            {chunks.length} passages above threshold\naria-label={`${chunk.source} relevance score`}\naria-valuetext={`${chunk.score.toFixed(2)} of 1.00`}';

it("replays the explicit labels seam and records adaptation hashes", () => {
  for (const file of SEARCH_LABELS_SEAM_FILES) {
    const source = file.endsWith("web-search.tsx") ? web : retrieval;
    const installed = applySearchPresentationLabels(source, file);
    expect(installed).toContain("labels?:");
    expect(installed).toContain('labels?.complete.replace("{count}"');
    if (file.endsWith("retrieval-chunks.tsx")) {
      expect(installed).toContain('labels?.relevance.replace("{source}", chunk.source)');
      expect(installed).toContain('labels?.score.replace("{score}", chunk.score.toFixed(2))');
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
  expect(provenance.patches).toEqual([]);
  const facade = await readFile(new URL("../src/internal/search-elements.tsx", import.meta.url), "utf8");
  expect(facade).not.toMatch(/children\[|cloneElement|localizeMeters|relevance score|of 1\\\.00/);
  expect(facade).toContain("labels={labels}");
});
