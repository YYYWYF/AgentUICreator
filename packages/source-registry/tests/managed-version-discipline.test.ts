import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadAgentUISourceRegistry } from "../src/index.js";

interface ReleasedItem {
  id: string;
  revision: string;
  version: string;
  files: Record<string, string>;
  requires: string[];
  packages: Record<string, string>;
}

const baseline = JSON.parse(await readFile(
  new URL("./fixtures/managed-upgrade-baseline.json", import.meta.url), "utf8",
)) as ReleasedItem[];

// Frozen versions and hashes from the recorded historical revisions. Never
// regenerate these from current source to make an unchanged version pass.
describe("managed source release version discipline", () => {
  it.each(baseline)("versions changes to $id since $revision", async previous => {
    const registry = await loadAgentUISourceRegistry();
    const current = registry.byId.get(previous.id);
    expect(current).toBeDefined();
    if (!current) throw new Error(`Missing released item ${previous.id}`);
    const files = Object.fromEntries(current.loadedFiles.map(file => [
      file.target, createHash("sha256").update(file.content).digest("hex"),
    ]));
    if (current.version === previous.version) {
      expect(files).toEqual(previous.files);
      expect(current.requires ?? []).toEqual(previous.requires);
      expect(current.packages ?? {}).toEqual(previous.packages);
    }
  });
});
