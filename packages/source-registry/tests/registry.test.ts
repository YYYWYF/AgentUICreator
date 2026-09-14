import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadAgentUISourceRegistry, parseSourceItem } from "../src/index.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("Agent UI Source Registry contract", () => {
  it("contains only the canonical assistant-ui foundation in production", async () => {
    const registry = await loadAgentUISourceRegistry();
    expect(registry.items.map((entry) => entry.id)).toEqual([
      "foundation/assistant-ui-conversation",
    ]);
    expect(registry.items.filter((entry) => entry.kind === "primitive")).toHaveLength(0);
    expect(registry.items.filter((entry) => entry.kind === "agent-component")).toHaveLength(0);
  });

  it("keeps the canonical foundation fully vendor-owned", async () => {
    const registry = await loadAgentUISourceRegistry();
    const foundation = registry.byId.get("foundation/assistant-ui-conversation");
    expect(foundation?.kind).toBe("foundation");
    expect(foundation?.files).toHaveLength(39);
    expect(foundation?.files.every((file) => file.target.startsWith("vendor/assistant-ui/"))).toBe(true);
    expect(foundation?.upstream).toMatchObject({
      project: "assistant-ui/assistant-ui",
      mode: "adapted",
      license: "MIT",
    });
  });

  it("parses the canonical registry manifest", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(packageRoot, "registry/registry.json"), "utf8"),
    ) as { schemaVersion: number; items: Array<{ id: string }> };
    expect(manifest).toEqual({
      schemaVersion: 1,
      items: [{
        id: "foundation/assistant-ui-conversation",
        path: "items/foundation-assistant-ui-conversation/item.json",
      }],
    });
    expect(parseSourceItem({
      schemaVersion: 1,
      id: "foundation/assistant-ui-conversation",
      version: "0.1.13",
      kind: "foundation",
      description: "canonical foundation",
      files: [],
    }, "item.json").id).toBe("foundation/assistant-ui-conversation");
  });
});
