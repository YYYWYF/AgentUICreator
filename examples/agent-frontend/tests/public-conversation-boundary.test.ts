import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceExtensions = new Set([".ts", ".tsx", ".css", ".json"]);
const forbiddenTokens = [
  "assistant-ui",
  "AssistantUi",
  "ASSISTANT_UI",
  "@assistant-ui/",
  "runtime-assistant-ui",
] as const;

async function collectSourceFiles(current: string): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const absolutePath = path.join(current, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(absolutePath);
    return entry.isFile() && sourceExtensions.has(path.extname(entry.name))
      ? [absolutePath]
      : [];
  }));
  return files.flat();
}

describe("Level 2 public Conversation source boundary", () => {
  it("keeps user-project production sources implementation-agnostic", async () => {
    const sourceFiles = [
      ...await collectSourceFiles(path.join(projectRoot, "plugins")),
      ...await collectSourceFiles(path.join(projectRoot, "app-ui")),
      ...await collectSourceFiles(path.join(projectRoot, "agent-ui/conversation")),
      path.join(projectRoot, "src/App.tsx"),
      path.join(projectRoot, "package.json"),
      path.join(projectRoot, "components.json"),
    ].sort();

    for (const filePath of sourceFiles) {
      const relativePath = path.relative(projectRoot, filePath).split(path.sep).join("/");
      const source = await readFile(filePath, "utf8");
      for (const token of forbiddenTokens) {
        expect(relativePath, token).not.toContain(token);
        expect(source, `${relativePath}: ${token}`).not.toContain(token);
      }
    }
  });
});
