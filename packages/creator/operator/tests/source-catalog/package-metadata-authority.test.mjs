// @vitest-environment node
import { describe, expect, it } from "vitest";
import { loadAgentUISourceRegistry, officialPackagePlugin, createOfficialResourceRegistry, resolveOfficialResource } from "../../src/source-catalog/index.ts";
import { validateOfficialPackageServices } from "../../scripts/source-catalog/verify-package-services.mjs";

describe("official package metadata authority", () => {
  it("resolves resource delivery exclusively from the package catalog", () => {
    const catalog = officialPackagePlugin("composer");
    const resource = resolveOfficialResource("composer");
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
    expect(registry.byId.get("plugin/composer").packages).not.toHaveProperty("@za38.03/agent-ui-plugins");
  });
  it("matches service metadata against the actual reference definition", async () => {
    await expect(validateOfficialPackageServices(await loadAgentUISourceRegistry())).resolves.toBeUndefined();
  });
  it.each(["provides", "inject", "optionalInject"])("fails closed on %s drift", async field => {
    const registry = await loadAgentUISourceRegistry();
    const catalog = officialPackagePlugin("composer");
    await expect(validateOfficialPackageServices(registry, [{ ...catalog,
      services: { ...catalog.services, [field]: ["unexpected.service"] },
    }])).rejects.toMatchObject({ code: "OFFICIAL_PACKAGE_SERVICE_METADATA_DRIFT" });
  });
  it("detects reference service changes including imported constants", async () => {
    const registry = await loadAgentUISourceRegistry();
    const byId = new Map(registry.byId);
    const item = byId.get("plugin/conversation-command-source");
    expect(item).toBeDefined();
    const definition = "plugins/conversation-command-source/definition.ts";
    byId.set(item.id, { ...item, loadedFiles: item.loadedFiles.map(file => file.target === definition
      ? { ...file, content: Buffer.from(file.content.toString().replaceAll("CONVERSATION_COMMAND_SOURCE", "CONVERSATION_MENTION_SOURCE")) } : file) });
    expect(byId.get(item.id).loadedFiles.find(file => file.target === definition).content.toString()).toContain("CONVERSATION_MENTION_SOURCE");
    await expect(validateOfficialPackageServices({ ...registry, byId })).rejects.toMatchObject({ code: "OFFICIAL_PACKAGE_SERVICE_METADATA_DRIFT" });
  });
});
