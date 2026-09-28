import { createHash } from "node:crypto";

import { expect, it } from "vitest";

import { installedVendorEntry, portalBridgePatch } from "../scripts/sync-assistant-ui-upstream.mjs";

const fixtures = [
  {
    localPath: "components/ui/dialog.tsx",
    source: 'import { cn } from "../../lib/utils";\nfunction DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {\n  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;\n}\n',
  },
  {
    localPath: "components/ui/popover.tsx",
    source: 'import { cn } from "../../lib/utils";\nfunction PopoverContent() {\n  return (\n    <PopoverPrimitive.Portal>\n      <PopoverPrimitive.Popup />\n    </PopoverPrimitive.Portal>\n  );\n}\n',
  },
  {
    localPath: "components/ui/sheet.tsx",
    source: 'import { cn } from "../../lib/utils";\nfunction SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {\n  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;\n}\n',
  },
  {
    localPath: "components/ui/tooltip.tsx",
    source: 'import { cn } from "../../lib/utils";\nfunction TooltipContent() {\n  return (\n    <TooltipPrimitive.Portal>\n      <TooltipPrimitive.Popup />\n    </TooltipPrimitive.Portal>\n  );\n}\n',
  },
  {
    localPath: "components/assistant-ui/elements/image.tsx",
    source: 'import { cn } from "../../../lib/utils";\nfunction ImageZoom() {\n  const [isOpen, setIsOpen] = useState(false);\n  return (\n    <>\n      {isOpen &&\n        createPortal(\n          <div data-slot="image-zoom-overlay" />,\n          document.body,\n        )}\n    </>\n  );\n}\n',
  },
];
const sha256 = (source) => createHash("sha256").update(source).digest("hex");

it("reapplies all five approved Portal bridges and records final installed hashes in sync provenance", () => {
  const entries = fixtures.map(({ localPath, source }) => installedVendorEntry({
    localPath, source, upstreamPath: `upstream/${localPath}`,
  }));
  expect(portalBridgePatch(entries.map((entry) => entry.provenance))).toEqual({
    id: "agent-ui-portal-container-bridge",
    reason: expect.any(String),
    files: fixtures.map((fixture) => fixture.localPath).sort(),
  });
  for (const entry of entries) {
    expect(entry.installed).toContain("useAgentUIPortalContainer");
    expect(entry.provenance.adaptations).toContain("agent-ui-portal-container-bridge");
    expect(entry.provenance.installedSha256).toBe(sha256(entry.installed));
    expect(entry.provenance.upstreamSha256).not.toBe(entry.provenance.installedSha256);
  }
  for (const entry of entries.filter(({ provenance }) => /(?:dialog|sheet)\.tsx$/u.test(provenance.localPath))) {
    expect(entry.installed).toContain('Omit<');
    expect(entry.installed).toMatch(/\.\.\.props\} \{\.\.\.\(portalContainer === undefined/u);
  }
  expect(entries.find(({ provenance }) => provenance.localPath.endsWith("image.tsx"))?.installed)
    .toContain("portalContainer ?? document.body");
});

it("fails loudly if an upstream Portal changes shape or a bridge file goes missing", () => {
  const changed = fixtures[0];
  expect(() => installedVendorEntry({
    ...changed,
    source: changed.source.replace("DialogPrimitive.Portal", "ChangedPortal"),
    upstreamPath: "upstream/dialog.tsx",
  })).toThrow(/cannot safely adapt.*changed upstream Portal structure/u);
  expect(() => portalBridgePatch(fixtures.slice(1))).toThrow(/expected all five approved Portal files/u);
});
