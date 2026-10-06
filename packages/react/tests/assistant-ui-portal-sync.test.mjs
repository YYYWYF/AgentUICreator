import { expect, it } from "vitest";
import { installedVendorEntry } from "../scripts/sync-assistant-ui-upstream.mjs";
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
