import { createHash } from "node:crypto";
import { parseCompatibilityManifest, type CompatibilityManifest } from "./compatibility-release.js";

export interface ReleaseDiscovery {
  status: "online" | "cached" | "unavailable" | "unconfigured";
  checkedAt: string;
  fetchedAt?: string;
  digest?: string;
  manifest?: CompatibilityManifest;
  issue?: "UPDATE_SOURCE_UNCONFIGURED" | "UPDATE_SOURCE_UNAVAILABLE";
}
export interface CompatibilityReleaseProvider { check(refresh?: boolean, projectRoot?: string): Promise<ReleaseDiscovery> }
/** Host-configured publisher feed; bounded GET only, no package installation or project writes. */
export class HttpCompatibilityReleaseProvider implements CompatibilityReleaseProvider {
  private cache: ReleaseDiscovery | undefined;
  private pending: Promise<ReleaseDiscovery> | undefined;
  private identities = new Map<string, string>();
  constructor(private readonly url?: string, private readonly options: { fetch?: typeof fetch; timeoutMs?: number; ttlMs?: number; now?: () => number } = {}) {}
  check(refresh = false): Promise<ReleaseDiscovery> {
    if (this.pending) return this.pending;
    const now = (this.options.now ?? Date.now)();
    if (!refresh && this.cache?.fetchedAt && now - Date.parse(this.cache.fetchedAt) < (this.options.ttlMs ?? 60_000) && this.cache.status === "online") return Promise.resolve({ ...this.cache, checkedAt: new Date(now).toISOString() });
    this.pending = this.read(now).finally(() => { this.pending = undefined; });
    return this.pending;
  }
  private async read(now: number): Promise<ReleaseDiscovery> {
    const checkedAt = new Date(now).toISOString();
    if (!this.url) return { status: "unconfigured", checkedAt, issue: "UPDATE_SOURCE_UNCONFIGURED" };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 8000);
    try {
      const url = new URL(this.url);
      if (url.username || url.password || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))) throw new Error("Invalid update source");
      const response = await (this.options.fetch ?? fetch)(url, { signal: controller.signal, redirect: "error", headers: { Accept: "application/json" } });
      if (!response.ok || !response.body || Number(response.headers.get("content-length") ?? 0) > 2_000_000) throw new Error("Update source unavailable");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = []; let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          size += value.length; if (size > 2_000_000) throw new Error("Update feed too large"); chunks.push(value);
        }
      } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
      const bytes = Buffer.concat(chunks);
      const manifest = parseCompatibilityManifest(JSON.parse(bytes.toString("utf8")));
      const reviewed = new Map<string, string>();
      for (const release of manifest.releases) {
        const digest = createHash("sha256").update(JSON.stringify(release)).digest("hex");
        if (this.identities.has(release.id) && this.identities.get(release.id) !== digest) throw new Error("Immutable release changed");
        reviewed.set(release.id, digest);
      }
      for (const [id, digest] of reviewed) this.identities.set(id, digest);
      this.cache = { status: "online", checkedAt, fetchedAt: checkedAt, manifest, digest: createHash("sha256").update(bytes).digest("hex") };
      return this.cache;
    } catch {
      if (this.cache) { this.cache = { ...this.cache, status: "cached", checkedAt, issue: "UPDATE_SOURCE_UNAVAILABLE" }; return this.cache; }
      return { status: "unavailable", checkedAt, issue: "UPDATE_SOURCE_UNAVAILABLE" };
    } finally { clearTimeout(timeout); }
  }
}
