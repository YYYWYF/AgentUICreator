import { generatedProjectFixture, repositoryRoot } from "../../../project-control/tests/support/generated-project";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = await generatedProjectFixture();

describe("scoped renderer upstream boundary", () => {
  it("keeps named Tool UI resolution and text rendering in the canonical Thread", async () => {
    const thread = await readFile(path.join(repositoryRoot, "packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx"), "utf8");
    expect(thread).toContain('case "text":');
    expect(thread).toContain("return <MarkdownText />;");
    expect(thread).toContain("part.toolUI ?? <ToolFallbackComponent {...part} />");
  });

  it("keeps product renderer code behind the public facade", async () => {
    for (const relativePath of [
      "agent-ui/conversation/ScopedRendererBridge.tsx",
      "plugins/assistant-ui-reasoning/index.tsx",
      "plugins/assistant-ui-tool-group/index.tsx",
      "plugins/assistant-ui-tool-fallback/index.tsx",
      "runtime/plugins/UIPluginRuntime.tsx",
    ]) {
      const source = await readFile(path.join(root, relativePath), "utf8");
      expect(source).not.toMatch(/from ["']@assistant-ui\/react/u);
      expect(source).not.toMatch(/from ["'][^"']*internal\/vendor\/assistant-ui/u);
    }
  });
});
