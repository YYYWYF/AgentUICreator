import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadAgentUISourceRegistry, parseSourceItem } from "../src/index.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const forbiddenPublicTokens = [
  "assistant-ui",
  "AssistantUi",
  "ASSISTANT_UI",
  "@assistant-ui/",
  "runtime-assistant-ui",
] as const;

describe("Agent UI Source Registry public conversation contract", () => {
  it("contains the generic Conversation foundation and optional demo bundles", async () => {
    const registry = await loadAgentUISourceRegistry();

    expect(registry.items.map((entry) => entry.id)).toEqual(expect.arrayContaining([
      "foundation/conversation", "demo/frontend-tool-dialog", "demo/frontend-tool-form",
    ]));
    expect(registry.items.filter(entry => entry.kind === "demo")).toHaveLength(2);
    expect(registry.items[0]?.kind).toBe("foundation");
    expect(registry.items.filter((entry) => entry.kind === "primitive")).toHaveLength(0);
    expect(registry.items.filter((entry) => entry.kind === "agent-component")).toHaveLength(0);
  });

  it("installs only the public Conversation bridge", async () => {
    const registry = await loadAgentUISourceRegistry();
    const foundation = registry.byId.get("foundation/conversation");

    expect(foundation?.files).toEqual([{
      source: "files/conversation/index.ts",
      target: "conversation/conversation-bridge.ts",
    }]);
    expect(foundation?.packages).toEqual({
      "@agent-ui/react": "^0.1.0",
      "@agent-ui/runtime-conversation": "^0.1.0",
    });
    expect(foundation?.upstream).toBeUndefined();

    const source = foundation?.loadedFiles[0]?.content.toString("utf8") ?? "";
    expect(source).toContain('from "@agent-ui/react"');
    expect(source).toContain("ConversationThread");
    for (const token of forbiddenPublicTokens) {
      expect(foundation?.manifestPath, token).not.toContain(token);
      expect(foundation?.files[0]?.source, token).not.toContain(token);
      expect(foundation?.files[0]?.target, token).not.toContain(token);
      expect(source, token).not.toContain(token);
    }
  });

  it("parses the canonical generic registry manifest", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(packageRoot, "registry/registry.json"), "utf8"),
    ) as { schemaVersion: number; items: Array<{ id: string }> };

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.items).toEqual(expect.arrayContaining([{
      id: "foundation/conversation", path: "items/foundation-conversation/item.json",
    }, {
      id: "demo/frontend-tool-dialog", path: "items/demo-frontend-tool-dialog/item.json",
    }, {
      id: "demo/frontend-tool-form", path: "items/demo-frontend-tool-form/item.json",
    }]));
    expect(parseSourceItem({
      schemaVersion: 1,
      id: "foundation/conversation",
      version: "0.1.13",
      kind: "foundation",
      description: "canonical Conversation foundation",
      files: [{ source: "files/conversation/index.ts", target: "conversation/conversation-bridge.ts" }],
    }, "item.json").id).toBe("foundation/conversation");
  });
});
