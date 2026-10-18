// @vitest-environment node
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { applyPluginPresentationBridge, prepareProductAdapters } from "../scripts/sync-product-adapters.mjs";
it("regenerates only a compatibility bridge for the maintained fallback owner", async () => {
  const {files}=await prepareProductAdapters();
  const bridge=files.find(file=>file.localPath.endsWith("/tool-fallback.aui.tsx"));
  expect(bridge.source).toBe('export * from "../../../../../../plugins/tool-fallback/adapters/presentation/tool-fallback.js";\n');
  const owner=await readFile(new URL("../src/plugins/tool-fallback/adapters/presentation/tool-fallback.tsx",import.meta.url),"utf8");
  expect(owner).toContain("function ToolFallbackApprovalImpl");
  expect(owner).toContain("ToolFallbackPresentationProps");
  expect(owner).not.toContain("createContext");
});
it("requires explicit review when an upstream or adaptation seam changes", () => {
  expect(()=>applyPluginPresentationBridge("new upstream source", "components/assistant-ui/elements/tool-fallback.aui.tsx")).toThrow("Review and merge the Plugin owner");
  expect(applyPluginPresentationBridge("other source", "components/ui/button.tsx")).toBe("other source");
});
