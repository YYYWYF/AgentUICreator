import { readFile } from "node:fs/promises";
import { repositoryRoot } from "../../../../packages/project-control/tests/support/generated-project";
import path from "node:path";

export type PluginCoverage = Record<string, { kind: "visual" | "headless"; scenarios: string[]; excludedReason?: string }>;

export async function readReleasePluginCoverage() {
  const release = JSON.parse(await readFile(path.join(repositoryRoot, "packages/source-registry/registry/release.json"), "utf8"));
  const coverage: PluginCoverage = JSON.parse(await readFile(new URL("./i18n-plugin-visual-coverage.json", import.meta.url), "utf8"));
  for (const [id, entry] of Object.entries(coverage)) {
    if (!["visual", "headless"].includes(entry.kind) || !entry.scenarios.length) {
      throw new Error(`Invalid release Plugin coverage: ${id}`);
    }
  }
  return { releaseIds: Object.keys(release.plugins).sort(), coverage };
}
