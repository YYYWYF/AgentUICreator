import { applyProductAdaptations } from "../scripts/sync-product-adapters.mjs";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { installedVendorEntry, prepareComposerTriggerSync } from "../scripts/sync-assistant-ui-upstream.mjs";
const fixtures = new URL("fixtures/composer-upstream/", import.meta.url);
const internal = new URL("../src/internal/", import.meta.url);
const record = JSON.parse(readFileSync(new URL("composer-trigger-UPSTREAM.json", internal), "utf8"));
const digest = source => createHash("sha256").update(source).digest("hex");
it("syncs the frozen matcher unchanged and records both hashes", async () => {
  const repo = await mkdtemp(path.join(tmpdir(), "composer-upstream-"));
  try {
    const destination = path.join(repo, record.upstreamPath);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(new URL("detectTrigger.ts", fixtures), destination);
    execFileSync("git", ["init", "-q", repo]);
    execFileSync("git", ["-C", repo, "add", "."]);
    execFileSync("git", ["-C", repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-qm", "fixture"]);
    const prepared = await prepareComposerTriggerSync(repo, "HEAD");
    const installed = readFileSync(new URL("trigger-matcher.ts", internal), "utf8");
    expect(prepared.installations[0].installed).toBe(installed);
    expect({ ...prepared.provenance, revision: record.revision }).toEqual(record);
    expect(digest(installed)).toBe(record.upstreamSha256);
  } finally { await rm(repo, { recursive: true, force: true }); }
});
it("replays the generic upstream child seam exactly and rejects shape drift", () => {
  const localPath = "components/assistant-ui/elements/composer-trigger-popover.aui.tsx";
  const upstreamPath = `packages/ui/src/components/react/assistant-ui/elements/composer-trigger-popover.aui.tsx`;
  const source = readFileSync(new URL("composer-trigger-popover.aui.tsx", fixtures), "utf8");
  const entry = installedVendorEntry({ source, localPath, upstreamPath });
  expect(entry.installed).toBe(readFileSync(new URL(`vendor/assistant-ui/${localPath}`, internal), "utf8"));
  expect(entry.provenance.adaptations).not.toContain("agent-ui-trigger-content-seam");
  expect(applyProductAdaptations(entry.installed, localPath)).toContain("{children}");
  expect(() => applyProductAdaptations(source.replace("  iconMap?: Record<string, IconComponent>;", "  changedIconMap?: Record<string, IconComponent>;"), localPath)).toThrow();
});
