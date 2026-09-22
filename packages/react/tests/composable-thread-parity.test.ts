import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const composableThreadPath = path.join(packageRoot, "src/internal/composable-thread.tsx");
const vendorRoot = path.join(packageRoot, "src/internal/vendor/assistant-ui");
const upstreamThreadPath = path.join(
  vendorRoot,
  "components/assistant-ui/elements/thread.aui.tsx",
);

describe("ComposableThread upstream parity", () => {
  it("keeps the upstream Thread anatomy and product Composer outlet", async () => {
    const source = await readFile(composableThreadPath, "utf8");
    for (const token of [
      "ThreadPrimitive.Root",
      "ThreadPrimitive.Viewport",
      "ThreadPrimitive.Messages",
      "ThreadPrimitive.ViewportFooter",
      "ThreadScrollToBottom",
      "ThreadFollowupSuggestions",
      "ThreadSuggestions",
      "const UserMessage",
      "const AssistantMessage",
      "const EditComposer",
    ]) {
      expect(source, token).toContain(token);
    }

    const footerStart = source.indexOf("<ThreadPrimitive.ViewportFooter");
    const footerEnd = source.indexOf("</ThreadPrimitive.ViewportFooter>", footerStart);
    expect(footerStart).toBeGreaterThanOrEqual(0);
    expect(footerEnd).toBeGreaterThan(footerStart);
    const footer = source.slice(footerStart, footerEnd);
    const footerOrder = [
      "<ThreadScrollToBottom />",
      "<ThreadFollowupSuggestions />",
      "{composer}",
      "<ThreadSuggestions />",
    ].map((token) => footer.indexOf(token));
    expect(footerOrder.every((index) => index >= 0)).toBe(true);
    expect(footerOrder).toEqual([...footerOrder].sort((left, right) => left - right));
  });

  it("uses normal bottom-following behavior for streaming turns", async () => {
    const source = await readFile(composableThreadPath, "utf8");

    expect(source).toContain('turnAnchor="bottom"');
    expect(source).not.toContain('turnAnchor="top"');
  });

  it("keeps vendored Thread ownership and product fork ownership separate", async () => {
    const [manifestSource, lockSource, upstreamThread, composableThread] = await Promise.all([
      readFile(path.join(vendorRoot, "upstream-elements.json"), "utf8"),
      readFile(path.join(vendorRoot, "assistant-ui-upstream.lock.json"), "utf8"),
      readFile(upstreamThreadPath, "utf8"),
      readFile(composableThreadPath, "utf8"),
    ]);
    const manifest = JSON.parse(manifestSource) as { owned?: string[] };
    const lock = JSON.parse(lockSource) as { elements?: Record<string, string> };
    const upstreamPath = "components/assistant-ui/elements/thread.aui.tsx";

    expect(upstreamThread).toContain("autoFocus = true");
    expect(composableThread).toContain("autoFocus = true");
    expect(manifest.owned).toContain(upstreamPath);
    expect(lock.elements?.[upstreamPath]).toMatch(/^[0-9a-f]{64}$/u);
    expect(upstreamThread).toContain("export const Thread");
    expect(composableThread).toContain(
      'from "./vendor/assistant-ui/components/assistant-ui/elements/attachment.aui.js"',
    );
    expect(composableThread).not.toMatch(
      /from "\.\/(?:attachment|file|image|markdown-text|reasoning\.aui|tool-fallback\.aui|tool-group\.aui|tooltip-icon-button)"/u,
    );
    expect(composableThread).not.toContain("AppUIModel");
    expect(composableThread).not.toContain("Plugin Runtime");
  });
});
