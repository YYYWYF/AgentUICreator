import { describe, expect, it } from "vitest";
import { loadAgentUISourceRegistry, officialPackagePlugin, createOfficialResourceRegistry, resolveOfficialResource } from "../src/index.ts";
import { validateOfficialPackageServices } from "../scripts/verify-package-services.mjs";

describe("official package metadata authority", () => {
  it("resolves resource delivery exclusively from the package catalog", () => {
    const catalog = officialPackagePlugin("assistant-ui-composer");
    const resource = resolveOfficialResource("conversation-composer");
    expect(resource.implementation.runtime).toEqual(catalog.runtime);
    expect(resource.implementation.referenceSourceItemId).toBe(catalog.referenceSourceItemId);
    const resolved = createOfficialResourceRegistry([{ ...resource, implementation: {
      ...resource.implementation, runtime: { type: "package", package: "stale", subpath: "./stale", version: "0" }, referenceSourceItemId: "stale/source",
    } }]).resolve(resource.id);
    expect(resolved.implementation.runtime).toEqual(catalog.runtime);
    expect(resolved.implementation.referenceSourceItemId).toBe(catalog.referenceSourceItemId);
  });
  it("keeps runtime delivery dependencies out of the reference item", async () => {
    const registry = await loadAgentUISourceRegistry();
    expect(registry.byId.get("plugin/assistant-ui-composer").packages).not.toHaveProperty("@agent-ui/plugins");
  });
  it("matches service metadata against the actual reference definition", async () => {
    await expect(validateOfficialPackageServices(await loadAgentUISourceRegistry())).resolves.toBeUndefined();
  });
  it.each(["provides", "inject", "optionalInject"])("fails closed on %s drift", async field => {
    const registry = await loadAgentUISourceRegistry();
    const catalog = officialPackagePlugin("assistant-ui-composer");
    await expect(validateOfficialPackageServices(registry, [{ ...catalog,
      services: { ...catalog.services, [field]: ["unexpected.service"] },
    }])).rejects.toMatchObject({ code: "OFFICIAL_PACKAGE_SERVICE_METADATA_DRIFT" });
  });
  it("detects reference service changes including imported constants", async () => {
    const registry = await loadAgentUISourceRegistry();
    const byId = new Map(registry.byId);
    const item = byId.get("foundation/core-application");
    expect(item).toBeDefined();
    byId.set(item.id, { ...item, loadedFiles: item.loadedFiles.map(file => file.target === "services/agent-ui-locale.ts"
      ? { ...file, content: Buffer.from(file.content.toString().replace('"agent-ui.locale"', '"changed.locale"')) } : file) });
    await expect(validateOfficialPackageServices({ ...registry, byId })).rejects.toMatchObject({ code: "OFFICIAL_PACKAGE_SERVICE_METADATA_DRIFT" });
  });
});
