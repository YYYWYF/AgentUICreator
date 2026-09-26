import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");

describe("Assistant Response ownership", () => {
  it("uses public assistant-ui APIs and leaves protocol identity outside grouping", async () => {
    const files = await Promise.all([
      read("internal/assistant-response.ts"),
      read("internal/assistant-response-runtime.tsx"),
      read("internal/composable-thread.tsx"),
    ]);
    for (const source of files) {
      expect(source).not.toMatch(/@assistant-ui\/(?:core|react-ag-ui)\/src\//);
      expect(source).not.toMatch(/@assistant-ui\/react\//);
      expect(source).not.toMatch(/from ["'][^"']*vendor[^"']*(?:runtime|primitive|store)/);
    }
    expect(files[0]).not.toContain("runId");
    expect(files[0]).not.toContain("vendor/");
    expect(files[1]).not.toContain("vendor/");
    expect(files[1]).not.toContain("startRun(");
    expect(files[1]).toContain("group.headMessageId");
    const responseActions = files[2]!.slice(files[2]!.indexOf("export const CanonicalResponseCopyAction"), files[2]!.indexOf("const UserFilePart"));
    expect(responseActions).not.toMatch(/ActionBarPrimitive\.(Copy|Reload|ExportMarkdown)|BranchPickerPrimitive|message\.isCopied/);
  });
});
