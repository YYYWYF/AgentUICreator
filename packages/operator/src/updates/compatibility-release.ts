import { z } from "zod";
import { valid, validRange, satisfies, compare, prerelease } from "semver";

export const officialPackageNames = ["core", "renderer", "runtime", "plugins", "web-component", "creator", "operator"].map(id => `@za38.03/agent-ui-${id}`);
const exact = z.string().max(100).refine(value => valid(value) === value, "Invalid exact version");
const range = z.string().max(200).refine(value => validRange(value) !== null, "Invalid version range");
const packageName = z.string().refine(value => officialPackageNames.includes(value), "Unknown official package");
export const compatibilityManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  releases: z.array(z.strictObject({
    id: z.string().min(1).max(160), publishedAt: z.iso.datetime(), channel: z.enum(["stable", "prerelease"]),
    minimumCreatorVersion: exact.optional(), minimumOperatorVersion: exact.optional(), node: range.optional(), react: range.optional(),
    packages: z.array(z.strictObject({
      name: packageName, version: exact,
      requires: z.record(packageName, range).default({}),
      historyFrom: exact.optional(),
      changes: z.array(z.strictObject({
        id: z.string().min(1).max(160), version: exact, summary: z.string().min(1).max(2000),
        kind: z.enum(["feature", "fix", "breaking"]), pluginId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).optional(),
      })).max(2000),
    })).min(1).max(7),
  })).max(128),
});
export type CompatibilityManifest = z.infer<typeof compatibilityManifestSchema>;
export type CompatibilityRelease = CompatibilityManifest["releases"][number];
export function parseCompatibilityManifest(input: unknown): CompatibilityManifest {
  const manifest = compatibilityManifestSchema.parse(input);
  const ids = new Set<string>();
  for (const release of manifest.releases) {
    if (ids.has(release.id)) throw new Error("UPDATE_MANIFEST_DUPLICATE_RELEASE");
    ids.add(release.id);
    const packages = new Map(release.packages.map(pkg => [pkg.name, pkg]));
    if (packages.size !== release.packages.length) throw new Error("UPDATE_MANIFEST_DUPLICATE_PACKAGE");
    for (const pkg of release.packages) {
      if (release.channel === "stable" && prerelease(pkg.version)) throw new Error("UPDATE_MANIFEST_UNSTABLE_VERSION");
      if (pkg.historyFrom && compare(pkg.historyFrom, pkg.version) > 0) throw new Error("UPDATE_MANIFEST_HISTORY_INVALID");
      const changes = new Set<string>();
      for (const change of pkg.changes) {
        const key = `${change.version}:${change.id}`;
        if (changes.has(key) || compare(change.version, pkg.version) > 0) throw new Error("UPDATE_MANIFEST_CHANGE_INVALID");
        changes.add(key);
      }
      for (const [name, required] of Object.entries(pkg.requires)) {
        const tool = (name: string) => name.endsWith("-creator") || name.endsWith("-operator");
        // Tool dependencies are resolved in their own installation, independently of the App.
        if (tool(pkg.name) && !tool(name)) continue;
        if (!tool(pkg.name) && tool(name)) throw new Error("UPDATE_MANIFEST_PRODUCTION_TOOL_DEPENDENCY");
        const target = packages.get(name);
        if (!target || !satisfies(target.version, required)) throw new Error("UPDATE_MANIFEST_INCOMPATIBLE_COMBINATION");
      }
    }
  }
  return manifest;
}
