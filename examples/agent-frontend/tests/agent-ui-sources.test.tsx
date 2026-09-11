// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { AgentSource, AgentSources } from "../agent-ui/components/sources";
import { AgentUIRoot } from "../agent-ui/foundation/AgentUIRoot";

const mountedRoots: Root[] = [];

async function render(children: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => root.render(<AgentUIRoot>{children}</AgentUIRoot>));
  return container;
}

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

describe("AgentSources", () => {
  it("renders title, links, descriptions, indices, and optional regions", async () => {
    const container = await render(
      <AgentSources title="Sources · 2" ariaLabel="Message sources" className="host-sources">
        <AgentSource
          title="AG-UI"
          href="https://example.com/ag-ui"
          description="Protocol reference"
          index={1}
          trailing="Web"
          className="host-source"
        />
        <AgentSource title="Local notes" leading="L" />
      </AgentSources>,
    );

    const sources = container.querySelector('[data-slot="agent-sources"]');
    expect(sources?.tagName).toBe("SECTION");
    expect(sources?.getAttribute("aria-label")).toBe("Message sources");
    expect(sources?.classList.contains("host-sources")).toBe(true);
    expect(container.querySelector('[data-slot="agent-sources-title"]')?.textContent)
      .toBe("Sources · 2");
    const items = container.querySelectorAll('[data-slot="agent-source"]');
    expect(items).toHaveLength(2);
    expect(items[0]?.classList.contains("host-source")).toBe(true);
    const link = items[0]?.querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://example.com/ag-ui");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noreferrer");
    expect(container.textContent).toContain("Protocol reference");
    expect(container.textContent).toContain("1");
    expect(container.textContent).toContain("Web");
    expect(container.textContent).toContain("L");
    expect(items[1]?.querySelector("a")).toBeNull();
  });
});
