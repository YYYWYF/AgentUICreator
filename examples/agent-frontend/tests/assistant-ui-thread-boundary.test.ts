import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function collectSourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(entryPath);
    return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")
      ? [entryPath]
      : [];
  }));
  return files.flat();
}

describe("assistant-ui Thread composition boundary", () => {
  it("does not copy Thread or Composer private structure into product code", async () => {
    const roots = [
      path.join(projectRoot, "agent-ui/conversation"),
      path.join(projectRoot, "plugins"),
    ];
    const sourceFiles = (await Promise.all(roots.map(collectSourceFiles))).flat();
    const forbidden = [
      /ThreadPrimitive\.(Root|Viewport|Messages)/u,
      /ComposerPrimitive\.Root/u,
      /AssistantActionBar/u,
      /GroupedParts/u,
      /AgentUICreatorThread/u,
    ];

    for (const file of sourceFiles) {
      const source = await readFile(file, "utf8");
      for (const pattern of forbidden) {
        expect(source, file).not.toMatch(pattern);
      }
    }
  });

  it("keeps Thread API and history policy at public seams", async () => {
    const thread = await readFile(
      path.join(projectRoot, "../../packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx"),
      "utf8",
    );
    const surface = await readFile(
      path.join(projectRoot, "agent-ui/conversation/ConversationSurface.tsx"),
      "utf8",
    );
    const runtime = await readFile(
      path.join(projectRoot, "../../packages/runtime-conversation/src/ConversationRuntimeProvider.tsx"),
      "utf8",
    );

    expect(thread).toContain("export type ThreadProps");
    expect(thread).toContain("components?: ThreadComponents | undefined");
    expect(thread).not.toContain("ThreadPresentation");
    expect(thread).not.toContain("ToolCallWrapper");
    expect(surface).not.toContain("presentation=");
    expect(runtime).toContain("isDisabled");
  });
});
