import { describe, expect, it } from "vitest";

import {
  assistantUiToolkit,
  formatSearchFilesResult,
} from "../agent-ui/adapters/assistant-ui/toolkit";

describe("assistant-ui tool presentation", () => {
  it("registers search_files as a standalone backend renderer", () => {
    const searchFiles = assistantUiToolkit.search_files;

    expect(searchFiles.type).toBe("backend");
    expect(searchFiles.display).toBe("standalone");
    expect(searchFiles.render).toBeTypeOf("function");
    expect((searchFiles as Record<string, unknown>).execute).toBeUndefined();
  });

  it("formats known and unknown search results defensively", () => {
    expect(formatSearchFilesResult({ files: [] })).toBe("0 files found");
    expect(formatSearchFilesResult({ files: ["src/App.tsx"] })).toBe(
      "1 file found — src/App.tsx",
    );
    expect(
      formatSearchFilesResult({ files: ["src/App.tsx", "src/main.tsx"] }),
    ).toBe("2 files found — src/App.tsx, src/main.tsx");
    expect(formatSearchFilesResult({ unexpected: true })).toBe(
      '{"unexpected":true}',
    );
  });
});
