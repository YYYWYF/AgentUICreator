import { expect, it } from "vitest";
import { adaptMarkdownMemoizeImport, installedVendorEntry, MARKDOWN_MEMOIZE_COMPATIBILITY } from "../scripts/sync-assistant-ui-upstream.mjs";

const localPath = "components/assistant-ui/elements/markdown-text.tsx";
const source = 'import {\n  memoizeMarkdownComponents,\n} from "@assistant-ui/react-markdown";\n';

it("records the old Markdown export as an import adaptation with distinct source and installed hashes", () => {
  const result = installedVendorEntry({ source, localPath, upstreamPath: "packages/ui/src/markdown-text.tsx" });
  expect(result.installed).toContain("unstable_memoizeMarkdownComponents as memoizeMarkdownComponents");
  expect(result.provenance.adaptations).toContain(MARKDOWN_MEMOIZE_COMPATIBILITY);
  expect(result.provenance.upstreamSha256).not.toBe(result.provenance.installedSha256);
});

it("limits the alias to Markdown 0.14.6 and the reviewed component", () => {
  expect(adaptMarkdownMemoizeImport(source, localPath, "0.14.23")).toBe(source);
  expect(adaptMarkdownMemoizeImport(source, "components/ui/button.tsx", "0.14.6")).toBe(source);
});

it("requires review when the upstream import changes", () => {
  expect(() => adaptMarkdownMemoizeImport(source.replace("memoizeMarkdownComponents,", "newExport,"), localPath, "0.14.6"))
    .toThrow("review the 0.14.6 compatibility adaptation");
});
