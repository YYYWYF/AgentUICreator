import { expect, it } from "vitest";
import { installedVendorEntry, isElementSource } from "../scripts/sync-assistant-ui-upstream.mjs";
import { applyProductAdaptations } from "../scripts/sync-product-adapters.mjs";
const localPath = "components/ui/dialog.tsx";
const source = 'import { cn } from "../../lib/utils";\nfunction DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {\n  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;\n}\n';
it("keeps Portal source unchanged in vendor and applies the container only in product integration", () => {
  const entry = installedVendorEntry({ source, localPath, upstreamPath: "upstream/dialog.tsx" });
  expect(entry.installed).toBe(source);
  expect(entry.provenance.adaptations).not.toContain("agent-ui-portal-container-bridge");
  const product = applyProductAdaptations(entry.installed, localPath);
  expect(product).toContain("useAgentUIPortalContainer");
  expect(product).toContain("container: portalContainer");
  expect(product).toContain("portalContainer === null");
});
it("rejects an upstream integration shape change instead of silently patching vendor", () => {
  const changed = source.replace("DialogPrimitive.Portal", "ChangedPortal");
  expect(installedVendorEntry({ source: changed, localPath }).installed).toBe(changed);
  expect(() => applyProductAdaptations(changed, localPath)).toThrow(/cannot safely adapt/);
});

it("reports product integration changes and generator drift without treating vendor as a bridge", async () => {
  const { productIntegrationReport } = await import("../../../scripts/generate-assistant-ui-upgrade-report.mjs");
  const audit = { upstreamPaths: [], provenance: { changed: false }, generatorDrift: { status: "PASS" } };
  const adapter = "packages/plugins/src/internal/adapters-generated/assistant-ui/components/ui/tooltip.tsx";
  const threadList = "packages/plugins/src/internal/conversation-thread-list-item.tsx";
  expect(productIntegrationReport([threadList], [], audit)).toMatchObject({
    status: "REVIEW REQUIRED: product adapter / Portal integration", changedFiles: [threadList],
  });
  expect(productIntegrationReport([], [], audit).seamFiles).toContain(threadList);
  const boundary = "packages/plugins/src/internal/style-boundary/AgentUIRoot.tsx";
  expect(productIntegrationReport([adapter, boundary], [], audit)).toMatchObject({
    status: "REVIEW REQUIRED: product adapter / Portal integration", changedFiles: [adapter, boundary],
  });
  expect(productIntegrationReport(["packages/plugins/src/internal/vendor-generated/assistant-ui/components/ui/tooltip.tsx"], [], audit))
    .toMatchObject({ status: "UNCHANGED", changedFiles: [] });
  expect(productIntegrationReport([], [], { ...audit, generatorDrift: { status: "REVIEW REQUIRED" } }).status)
    .toContain("REVIEW REQUIRED");
  expect(productIntegrationReport([], [], { ...audit, provenance: { changed: true } }).status)
    .toContain("REVIEW REQUIRED");
  expect(productIntegrationReport([], undefined, audit).status).toContain("REVIEW REQUIRED");
});

it("recognizes TypeScript element helpers without adopting their tests", () => {
  expect(isElementSource("elements/receipt-focus.ts")).toBe(true);
  expect(isElementSource("elements/thread.aui.tsx")).toBe(true);
  expect(isElementSource("elements/receipt-focus.test.ts")).toBe(false);
  expect(isElementSource("elements/thread.spec.tsx")).toBe(false);
});
