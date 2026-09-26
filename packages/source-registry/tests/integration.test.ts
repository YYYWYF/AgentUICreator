import { describe, expect, it } from "vitest";
import { loadAgentUISourceRegistry, isOptionalAgentUISourceItem, parseSourceItem, resolveAgentUISourceItemClosure } from "../src/index.js";

describe("official integration resources", () => {
  it("accepts pluginless, tool-less bridges", () => {
    const item = parseSourceItem({ schemaVersion: 1, id: "integration/example", version: "0.1.0", kind: "integration", description: "Renderer bridge", files: [{ source: "files/bridge.ts", target: "integrations/example/bridge.ts" }] }, "item.json");
    expect(item.kind).toBe("integration");
    expect(isOptionalAgentUISourceItem(item)).toBe(true);
    expect(isOptionalAgentUISourceItem({ kind: "demo" })).toBe(true);
    expect(isOptionalAgentUISourceItem({ kind: "foundation" })).toBe(false);
    expect(item.files).toHaveLength(1);
  });
  it("shares dependency-first closure and leaves foundations free of optional integrations", async () => {
    const registry = await loadAgentUISourceRegistry();
    const integration = registry.byId.get("integration/react-hook-form")!;
    expect(integration.kind).toBe("integration");
    expect(integration.files.every(file => file.target.startsWith("integrations/"))).toBe(true);
    expect(resolveAgentUISourceItemClosure(registry, "demo/frontend-tool-form").map(item => item.id)).toEqual(["foundation/core-contracts", "foundation/core-runtime", "integration/react-hook-form", "demo/frontend-tool-form"]);
    for (const item of registry.items.filter(item => item.kind === "foundation")) {
      expect(resolveAgentUISourceItemClosure(registry, item.id).some(item => item.kind === "integration" || item.kind === "demo")).toBe(false);
    }
    expect(resolveAgentUISourceItemClosure(registry, "demo/frontend-tool-dialog").some(item => item.id === integration.id)).toBe(false);
  });
  it("rejects cycles and unavailable dependencies in pure callers", async () => {
    const registry = await loadAgentUISourceRegistry();
    const integration = registry.byId.get("integration/react-hook-form")!;
    const missing = { ...integration, requires: ["integration/missing"] };
    const byId = new Map(registry.byId); byId.set(missing.id, missing);
    expect(() => resolveAgentUISourceItemClosure({ ...registry, byId }, missing.id)).toThrow(/unavailable/);
    byId.set(missing.id, { ...integration, requires: [integration.id] });
    expect(() => resolveAgentUISourceItemClosure({ ...registry, byId }, missing.id)).toThrow(/cycle/);
  });
});
