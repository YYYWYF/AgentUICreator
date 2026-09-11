// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  AgentAttachment,
  AgentAttachments,
} from "../agent-ui/components/attachments";
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

describe("AgentAttachments", () => {
  it("renders children, kinds, links, descriptions, and optional regions", async () => {
    const container = await render(
      <AgentAttachments ariaLabel="Message attachments" className="host-group">
        <AgentAttachment
          name="screenshot.png"
          kind="image"
          href="https://example.com/screenshot.png"
          description="PNG image"
          preview={<span data-testid="preview">preview</span>}
          trailing={<span data-testid="trailing">ready</span>}
          className="host-item"
        />
        <AgentAttachment name="notes.txt" kind="file" leading="DOC" />
      </AgentAttachments>,
    );

    const group = container.querySelector('[data-slot="agent-attachments"]');
    expect(group?.getAttribute("aria-label")).toBe("Message attachments");
    expect(group?.classList.contains("host-group")).toBe(true);
    const items = container.querySelectorAll('[data-slot="agent-attachment"]');
    expect(items).toHaveLength(2);
    expect(items[0]?.tagName).toBe("A");
    expect(items[0]?.getAttribute("data-kind")).toBe("image");
    expect(items[0]?.getAttribute("href")).toBe("https://example.com/screenshot.png");
    expect(items[0]?.getAttribute("target")).toBe("_blank");
    expect(items[0]?.getAttribute("rel")).toBe("noreferrer");
    expect(items[0]?.classList.contains("host-item")).toBe(true);
    expect(items[1]?.tagName).toBe("DIV");
    expect(items[1]?.getAttribute("data-kind")).toBe("file");
    expect(container.textContent).toContain("screenshot.png");
    expect(container.textContent).toContain("PNG image");
    expect(container.textContent).toContain("preview");
    expect(container.textContent).toContain("ready");
    expect(container.textContent).toContain("DOC");
  });
});
