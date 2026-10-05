import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_AGENT_UI_SOURCE_REGISTRY_ROOT, loadAgentUISourceRegistry } from "./loader.js";
import type { LoadedAgentUISourceRegistry, LoadedAgentUISourceItem } from "./types.js";

export interface ReleaseDescriptor {
  releaseVersion: string;
  contractVersion: number;
  minimumCreatorVersion?: string;
  plugins: Record<string, { version: string }>;
}
export interface ChangelogEntry { summary: string; changes: string[] }
export interface ResolvedSourceRelease {
  descriptor: ReleaseDescriptor;
  registry: LoadedAgentUISourceRegistry;
  changelogs: Record<string, Record<string, ChangelogEntry>>;
}
export interface UpdateSourceProvider {
  getLatestRelease(): Promise<ReleaseDescriptor>;
  resolveRelease(version: string): Promise<ResolvedSourceRelease>;
}
export const releaseVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export function comparePluginVersions(a: string, b: string): number {
  if (!releaseVersionPattern.test(a) || !releaseVersionPattern.test(b)) throw new Error("Invalid release/plugin version");
  const left = a.split(".").map(Number), right = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i]! - right[i]!;
  return 0;
}
export function parseReleaseDescriptor(value: unknown): ReleaseDescriptor {
  const raw = value as ReleaseDescriptor;
  if (!raw || !releaseVersionPattern.test(raw.releaseVersion) || !Number.isSafeInteger(raw.contractVersion) || raw.contractVersion < 1 ||
      !raw.plugins || typeof raw.plugins !== "object" || Array.isArray(raw.plugins) ||
      (raw.minimumCreatorVersion !== undefined && !releaseVersionPattern.test(raw.minimumCreatorVersion))) throw new Error("Invalid release manifest");
  for (const [id, plugin] of Object.entries(raw.plugins)) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || !plugin || !releaseVersionPattern.test(plugin.version)) throw new Error("Invalid release plugin metadata");
  }
  return raw;
}
export function pluginSourceDigest(item: LoadedAgentUISourceItem): string {
  return createHash("sha256").update(JSON.stringify({ requires: item.requires, packages: item.packages,
    files: item.loadedFiles.map(f => [f.target, createHash("sha256").update(f.content).digest("hex")]).sort() })).digest("hex");
}
export async function resolveSourceRelease(root: string): Promise<ResolvedSourceRelease> {
  const descriptor = parseReleaseDescriptor(JSON.parse(await readFile(path.join(root, "release.json"), "utf8")));
  const registry = await loadAgentUISourceRegistry(root);
  const changelogs: ResolvedSourceRelease["changelogs"] = {};
  const pluginItems = registry.items.filter(item => item.id.startsWith("plugin/"));
  if (pluginItems.length !== Object.keys(descriptor.plugins).length) throw new Error("Release plugin inventory mismatch");
  for (const item of pluginItems) {
    const id = item.id.slice(7);
    const file = item.loadedFiles.find(f => f.target === `plugins/${id}/manifest.json`);
    if (!file || JSON.parse(file.content.toString()).version !== descriptor.plugins[id]?.version) throw new Error(`Plugin manifest mismatch: ${id}`);
    const log = JSON.parse(await readFile(path.join(item.itemRoot, "changelog.json"), "utf8"));
    for (const [version, entry] of Object.entries(log) as [string, ChangelogEntry][]) {
      if (!releaseVersionPattern.test(version) || !entry || typeof entry.summary !== "string" || !entry.summary.trim() ||
          !Array.isArray(entry.changes) || !entry.changes.length || entry.changes.some(change => typeof change !== "string" || !change.trim())) throw new Error(`Invalid changelog: ${id}@${version}`);
    }
    if (!log[descriptor.plugins[id]!.version]) throw new Error(`Missing changelog: ${id}`);
    changelogs[id] = log;
  }
  return { descriptor, registry, changelogs };
}
export function verifySourceRelease(target: ResolvedSourceRelease, previous?: ResolvedSourceRelease): void {
  if (previous && comparePluginVersions(target.descriptor.releaseVersion, previous.descriptor.releaseVersion) <= 0) throw new Error("Release must advance");
  for (const [id, plugin] of Object.entries(target.descriptor.plugins)) {
    const old = previous?.descriptor.plugins[id];
    if (old && comparePluginVersions(plugin.version, old.version) < 0) throw new Error(`Plugin version regressed: ${id}`);
    const item = target.registry.byId.get(`plugin/${id}`)!;
    const before = previous?.registry.byId.get(item.id);
    if (before && pluginSourceDigest(before) !== pluginSourceDigest(item) && comparePluginVersions(plugin.version, old!.version) <= 0) throw new Error(`Changed plugin needs a version bump and changelog: ${id}`);
    if (!target.changelogs[id]?.[plugin.version]) throw new Error(`Missing changelog: ${id}`);
    for (const [version, entry] of Object.entries(previous?.changelogs[id] ?? {})) {
      if (JSON.stringify(target.changelogs[id]?.[version]) !== JSON.stringify(entry)) throw new Error(`Historical changelog must be retained: ${id}@${version}`);
    }
  }
}
export class MockUpdateSourceProvider implements UpdateSourceProvider {
  constructor(readonly root = path.join(DEFAULT_AGENT_UI_SOURCE_REGISTRY_ROOT, "../fixtures/releases"), readonly latest = "0.0.2") {}
  async getLatestRelease(): Promise<ReleaseDescriptor> { return (await this.resolveRelease(this.latest)).descriptor; }
  async resolveRelease(version: string): Promise<ResolvedSourceRelease> {
    if (!releaseVersionPattern.test(version)) throw new Error("Invalid exact release version");
    const result = await resolveSourceRelease(path.join(this.root, version));
    if (result.descriptor.releaseVersion !== version) throw new Error("Exact release mismatch");
    return result;
  }
}
