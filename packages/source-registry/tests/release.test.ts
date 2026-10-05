import { describe, expect, it } from "vitest";
import { MockUpdateSourceProvider, comparePluginVersions, parseReleaseDescriptor, verifySourceRelease } from "../src/release.js";

describe("release contract", () => {
  it("retains exact historical sources and authored changelogs", async () => {
    const provider = new MockUpdateSourceProvider();
    const old = await provider.resolveRelease("0.0.1"), latest = await provider.resolveRelease("0.0.2");
    verifySourceRelease(latest, old);
    expect(latest.descriptor.plugins["conversation-surface"]?.version).toBe("0.0.2");
    expect(old.descriptor.plugins["conversation-surface"]?.version).toBe("0.0.1");
    expect(latest.changelogs["conversation-surface"]).toHaveProperty("0.0.1");
    await expect(provider.resolveRelease("../registry")).rejects.toThrow();
    await expect(provider.resolveRelease("9.9.9")).rejects.toThrow();
  });
  it("rejects changed sources without a bump, regressions, and missing release metadata", async () => {
    const provider = new MockUpdateSourceProvider();
    const old = await provider.resolveRelease("0.0.1"), latest = await provider.resolveRelease("0.0.2");
    latest.descriptor.plugins["conversation-surface"]!.version = "0.0.1";
    expect(() => verifySourceRelease(latest, old)).toThrow(/version bump/);
    expect(() => parseReleaseDescriptor({ releaseVersion: "../bad", contractVersion: 1, plugins: {} })).toThrow();
    expect(comparePluginVersions("0.0.10", "0.0.2")).toBeGreaterThan(0);
  });
});
it("uses the current Registry baseline and the next Mock package release by default", async () => {
  const provider = new MockUpdateSourceProvider();
  expect((await provider.getLatestRelease()).releaseVersion).toBe("0.1.1");
  verifySourceRelease(await provider.resolveRelease("0.1.1"), await provider.resolveRelease("0.1.0"));
});
