import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";

import { AgentUIDialog } from "../src/internal/style-boundary/AgentUIDialog";
import { AgentUIRoot } from "../src/internal/style-boundary/AgentUIRoot";
import { Dialog, DialogPortal } from "../src/internal/vendor/assistant-ui/components/ui/dialog";
import { Sheet, SheetContent } from "../src/internal/vendor/assistant-ui/components/ui/sheet";

it("keeps public Dialog and vendored Dialog/Sheet Portals inside AgentUIRoot when given a body container", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<AgentUIRoot theme="dark">
      <AgentUIDialog.Root open><AgentUIDialog.Portal {...{ container: document.body }}><div data-test-portal="facade" /></AgentUIDialog.Portal></AgentUIDialog.Root>
      <Dialog open><DialogPortal {...{ container: document.body }}><div data-test-portal="dialog" /></DialogPortal></Dialog>
      <Sheet open><SheetContent showCloseButton={false}><div data-test-portal="sheet" /></SheetContent></Sheet>
    </AgentUIRoot>));
    for (const kind of ["facade", "dialog", "sheet"]) {
      const portal = document.querySelector(`[data-test-portal="${kind}"]`);
      expect(portal, kind).not.toBeNull();
      expect(portal?.closest("[data-agent-ui-portal-root]")).not.toBeNull();
      expect(portal?.closest(".dark")).toBe(host.querySelector("[data-agent-ui-root]"));
    }
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("preserves the Base UI default Portal destination without AgentUIRoot", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(
      <AgentUIDialog.Root open><AgentUIDialog.Portal><div data-test-standalone-portal="" /></AgentUIDialog.Portal></AgentUIDialog.Root>,
    ));
    expect(document.querySelector("[data-test-standalone-portal]")?.closest("[data-base-ui-portal]")?.parentElement).toBe(document.body);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
