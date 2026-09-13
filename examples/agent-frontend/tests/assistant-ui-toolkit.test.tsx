// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  SearchFilesToolUI,
  assistantUiToolkit,
  formatSearchFilesResult,
} from "../agent-ui/adapters/assistant-ui/toolkit";

type SearchFilesToolProps = ToolCallMessagePartProps<
  Record<string, unknown>,
  unknown
>;

const mountedRoots: Root[] = [];

function createSearchFilesToolProps(
  overrides: Partial<SearchFilesToolProps> = {},
): SearchFilesToolProps {
  return {
    type: "tool-call",
    toolCallId: "search-files-1",
    toolName: "search_files",
    args: { keyword: "AG-UI" },
    argsText: '{"keyword":"AG-UI"}',
    result: undefined,
    status: { type: "running" },
    addResult: () => undefined,
    resume: () => undefined,
    respondToApproval: async () => undefined,
    ...overrides,
  };
}

async function renderSearchFilesTool(props: SearchFilesToolProps) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => root.render(<SearchFilesToolUI {...props} />));
  return container;
}

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

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
    expect(formatSearchFilesResult(undefined)).toBe("");
    expect(formatSearchFilesResult(null)).toBe("");
  });

  it("renders the official ToolCall without an undefined running result", async () => {
    const container = await renderSearchFilesTool(
      createSearchFilesToolProps(),
    );

    expect(container.querySelector('[data-slot="tool-call"]')).not.toBeNull();
    expect(container.textContent).toContain("Searching files");
    expect(container.textContent).toContain("AG-UI");

    const trigger = container.querySelector(
      '[data-slot="collapsible-trigger"]',
    ) as HTMLButtonElement;
    await act(async () => trigger.click());

    expect(container.textContent).toContain("Request");
    expect(container.textContent).toContain("Result");
    expect(container.textContent).not.toContain("undefined");
    expect(
      container.querySelector('[data-slot="tool-fallback-root"]'),
    ).toBeNull();
  });

  it("renders the completed result summary through the official ToolCall", async () => {
    const container = await renderSearchFilesTool(
      createSearchFilesToolProps({
        result: { files: ["src/App.tsx", "src/main.tsx"] },
        status: { type: "complete" },
      }),
    );

    const trigger = container.querySelector(
      '[data-slot="collapsible-trigger"]',
    ) as HTMLButtonElement;
    await act(async () => trigger.click());

    expect(container.querySelector('[data-slot="tool-call"]')).not.toBeNull();
    expect(container.textContent).toContain("Searched files");
    expect(container.textContent).toContain("2 files found");
  });

  it("uses the official ToolFallback for incomplete errors", async () => {
    const container = await renderSearchFilesTool(
      createSearchFilesToolProps({
        isError: true,
        status: { type: "incomplete", reason: "error" },
      }),
    );

    expect(container.querySelectorAll('[data-slot="tool-call"]')).toHaveLength(
      0,
    );
    expect(
      container.querySelectorAll('[data-slot="tool-fallback-root"]'),
    ).toHaveLength(1);
  });

  it("uses the official ToolFallback and preserves approval controls", async () => {
    const container = await renderSearchFilesTool(
      createSearchFilesToolProps({
        approval: {
          id: "approval-1",
          prompt: "Allow searching files?",
        },
        status: { type: "requires-action", reason: "tool-calls" },
      }),
    );

    expect(container.querySelectorAll('[data-slot="tool-call"]')).toHaveLength(
      0,
    );
    expect(
      container.querySelectorAll('[data-slot="tool-fallback-root"]'),
    ).toHaveLength(1);
    expect(
      container.querySelector('[data-slot="tool-fallback-approval"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("Allow");
    expect(container.textContent).toContain("Deny");
  });
});
