import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadAgentUISourceRegistry, parseSourceItem, resolveAgentUISourceItemClosure, validateOfficialResourceSources } from "../src/index.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const forbiddenPublicTokens = [
  "assistant-ui",
  "AssistantUi",
  "ASSISTANT_UI",
  "@assistant-ui/",
  "runtime-assistant-ui",
] as const;

describe("Agent UI Source Registry public conversation contract", () => {
  it("contains the generic Conversation foundation, managed plugins and optional demo bundles", async () => {
    const registry = await loadAgentUISourceRegistry();

    expect(registry.items.map((entry) => entry.id)).toEqual(expect.arrayContaining([
      "foundation/conversation", "demo/frontend-tool-dialog", "demo/frontend-tool-form", "demo/ask-user-question",
    ]));
    expect(registry.items.filter(entry => entry.kind === "demo")).toHaveLength(3);
    expect(() => validateOfficialResourceSources(registry)).not.toThrow();
    expect(registry.byId.get("foundation/conversation")?.kind).toBe("foundation");
    expect(registry.items.filter((entry) => entry.kind === "primitive")).toHaveLength(0);
    expect(registry.items.filter((entry) => entry.kind === "agent-component").map(entry => entry.id)).toEqual(expect.arrayContaining([
      "agent-component/assistant-ui-generative-ui", "plugin/conversation-surface",
      "plugin/assistant-ui-response-footer", "plugin/assistant-ui-message-footer",
    ]));
    expect(registry.byId.get("plugin/assistant-ui-response-footer")?.requires).toContain("plugin/conversation-surface");
    for (const action of ["copy", "reload", "export-markdown"]) {
      expect(registry.byId.get(`plugin/assistant-ui-${action}-action`)?.requires).toContain("plugin/assistant-ui-response-footer");
    }
  });

  it("resolves the Human Tool Demo through its real foundation without optional integration leakage", async () => {
    const registry = await loadAgentUISourceRegistry();
    const core = resolveAgentUISourceItemClosure(registry, "foundation/core").map(item => item.id);
    const demo = resolveAgentUISourceItemClosure(registry, "demo/ask-user-question").map(item => item.id);
    expect(demo).toEqual([...core, "demo/ask-user-question"]);
    expect(demo).toContain("foundation/core");
    expect(demo).not.toContain("integration/react-hook-form");
    expect(demo.some(id => id.startsWith("integration/"))).toBe(false);
    for (const foundation of registry.items.filter(item => item.kind === "foundation")) {
      expect(resolveAgentUISourceItemClosure(registry, foundation.id).map(item => item.id)).not.toContain("demo/ask-user-question");
    }
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
    ) as { items: Array<{ id: string }> };

    expect(manifest.items).toEqual(expect.arrayContaining([{
      id: "foundation/conversation", path: "items/foundation-conversation/item.json",
    }, {
      id: "demo/frontend-tool-dialog", path: "items/demo-frontend-tool-dialog/item.json",
    }, {
      id: "demo/frontend-tool-form", path: "items/demo-frontend-tool-form/item.json",
    }, {
      id: "demo/ask-user-question", path: "items/demo-ask-user-question/item.json",
    }]));
    expect(parseSourceItem({
      id: "foundation/conversation",
      version: "0.1.13",
      kind: "foundation",
      description: "canonical Conversation foundation",
      files: [{ source: "files/conversation/index.ts", target: "conversation/conversation-bridge.ts" }],
    }, "item.json").id).toBe("foundation/conversation");
  });
});
