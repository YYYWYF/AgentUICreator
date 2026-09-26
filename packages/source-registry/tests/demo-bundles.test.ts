import { describe, expect, it } from "vitest";
import { loadAgentUISourceRegistry } from "../src/index.js";
describe("optional scenario bundles", () => {
  it("models cross-layer resources as demo, outside foundation dependency closure", async () => {
    const registry = await loadAgentUISourceRegistry();
    for (const id of ["demo/frontend-tool-dialog", "demo/frontend-tool-form"]) {
      const item = registry.byId.get(id)!;
      expect(item.kind).toBe("demo");
      for (const prefix of ["services/", "plugins/", "agent-contract/frontend-tools/", "agent-ui/conversation/frontend-tool-uis/"]) {
        expect(item.files.some(file => file.target.startsWith(prefix))).toBe(true);
      }
      expect(registry.items.filter(item => item.kind === "foundation").some(item => item.requires?.includes(id))).toBe(false);
    }
    expect(registry.byId.get("demo/frontend-tool-form")?.packages).toBeUndefined();
    expect(registry.byId.get("demo/frontend-tool-form")?.requires).toEqual(["integration/react-hook-form"]);
    expect(registry.byId.get("integration/react-hook-form")?.packages).toEqual({ "react-hook-form": "^7", "@assistant-ui/react-hook-form": "0.12.34" });
    expect(registry.items.filter(item => item.kind === "foundation").some(item => item.files.some(file => /demo-(form|dialog)|frontend-tool-(form|dialog)-demo/.test(file.target)))).toBe(false);
  });
});
