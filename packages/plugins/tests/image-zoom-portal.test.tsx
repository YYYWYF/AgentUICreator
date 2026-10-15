import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";

import { AgentUIRoot } from "../src/internal/style-boundary/AgentUIRoot";
import { ImageZoom } from "../src/internal/adapters/assistant-ui/components/assistant-ui/elements/image";

it("keeps the upstream image zoom Portal inside the Agent UI boundary", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => {
      root.render(<AgentUIRoot theme="dark"><ImageZoom src="data:image/png;base64,iVBORw0KGgo=">
        <span>Open image</span>
      </ImageZoom></AgentUIRoot>);
    });
    await act(async () => {
      host.querySelector<HTMLElement>('[role="button"][aria-label="Click to zoom image"]')?.click();
    });
    const overlay = document.querySelector('[data-slot="image-zoom-overlay"]');
    expect(host.querySelector("[data-agent-ui-root]")?.classList.contains("dark")).toBe(true);
    expect(overlay).not.toBeNull();
    expect(overlay?.closest("[data-agent-ui-portal-root]")).not.toBeNull();
    expect(overlay?.closest("[data-agent-ui-root]")?.getAttribute("data-theme")).toBe("dark");
    expect(overlay?.closest(".dark")).toBe(host.querySelector("[data-agent-ui-root]"));
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
