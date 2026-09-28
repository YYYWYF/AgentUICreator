import { useState } from "react";
import { createRoot } from "react-dom/client";

import {
  AgentUIRoot,
  Button,
  AgentUIDialog,
  AgentUIDialogContent,
  AgentUIPopover,
  AgentUIPopoverContent,
  AgentUIPopoverTrigger,
  AgentUITooltip,
  AgentUITooltipContent,
  AgentUITooltipProvider,
  AgentUITooltipTrigger,
} from "@agent-ui/react";

import "./hostile-host.css";
import installedAgentSource from "./agent-ui/application/Agent.tsx?raw";

const properties = ["margin", "padding", "borderWidth", "boxSizing", "fontSize", "fontFamily", "backgroundColor", "listStyleType", "appearance"] as const;
for (const probe of document.querySelectorAll<HTMLElement>("[data-host-probe]")) {
  const style = getComputedStyle(probe);
  probe.dataset.beforeAgent = JSON.stringify(Object.fromEntries(properties.map((property) => [property, style[property]])));
}

function PortalProbes() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [kind, setKind] = useState<"tooltip" | "popover" | "dialog" | "facade-dialog" | null>(null);
  return <AgentUIRoot theme={theme}>
    <h1 data-test-agent-heading>Agent heading</h1>
    <input data-test-agent-input aria-label="Agent input probe" />
    <ul data-test-agent-list><li>Agent list</li></ul>
    <button type="button" data-test-theme onClick={() => setTheme(current => current === "light" ? "dark" : "light")}>Theme</button>
    <button type="button" data-test-open="tooltip" onClick={() => setKind("tooltip")}>Tooltip</button>
    <button type="button" data-test-open="popover" onClick={() => setKind("popover")}>Popover</button>
    <button type="button" data-test-open="dialog" onClick={() => setKind("dialog")}>Dialog</button>
    <AgentUITooltipProvider>
      <AgentUITooltip open={kind === "tooltip"}>
        <AgentUITooltipTrigger render={<button type="button">Tooltip trigger</button>} />
        <AgentUITooltipContent>Tooltip probe</AgentUITooltipContent>
      </AgentUITooltip>
    </AgentUITooltipProvider>
    <AgentUIPopover open={kind === "popover"}>
      <AgentUIPopoverTrigger render={<button type="button">Popover trigger</button>} />
      <AgentUIPopoverContent>Popover probe</AgentUIPopoverContent>
    </AgentUIPopover>
    <AgentUIDialog.Root open={kind === "dialog"} onOpenChange={(open: boolean) => { if (!open) setKind(null); }}>
      <AgentUIDialogContent data-test-dialog="" showCloseButton={false}>
        <AgentUIDialog.Title>Dialog probe</AgentUIDialog.Title>
      </AgentUIDialogContent>
    </AgentUIDialog.Root>
    <button type="button" data-test-open="facade-dialog" onClick={() => setKind("facade-dialog")}>Facade Dialog</button>
    <AgentUIDialog.Root open={kind === "facade-dialog"} onOpenChange={(open: boolean) => { if (!open) setKind(null); }}>
      <AgentUIDialog.Portal {...{ container: document.body }}>
        <AgentUIDialog.Popup data-test-facade-dialog="">
          <AgentUIDialog.Title>Facade Dialog probe</AgentUIDialog.Title>
          <Button variant="outline" data-test-dark-button="">Dark variant probe</Button>
        </AgentUIDialog.Popup>
      </AgentUIDialog.Portal>
    </AgentUIDialog.Root>
  </AgentUIRoot>;
}

const { AgentMount } = await import("./AgentMount");
// Locally customized, ignored generated projects can predate AgentUIRoot. The
// checked-in source template is separately guarded by the integration test.
createRoot(document.getElementById("agent-isolation-mount")!).render(
  installedAgentSource.includes("<AgentUIRoot theme={theme}>")
    ? <AgentMount />
    : <AgentUIRoot theme="light"><AgentMount /></AgentUIRoot>,
);
createRoot(document.getElementById("portal-isolation-mount")!).render(<PortalProbes />);
