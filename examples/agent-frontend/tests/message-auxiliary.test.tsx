// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  MessageAttachmentList,
  MessageEmptyState,
  MessageErrorState,
  MessageLoadingState,
  MessageSourceList,
} from "../plugins/agent-message-list/message-auxiliary";

const mountedRoots: Root[] = [];

async function render(element: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => root.render(element));
  return container;
}

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

describe("message auxiliary presentation", () => {
  it("renders compact attachment kinds, names, and safe links", async () => {
    const container = await render(
      <MessageAttachmentList
        items={[
          {
            key: "image",
            name: "screenshot.png",
            type: "image",
            src: "https://example.com/screenshot.png",
          },
          { key: "audio", name: "recording.opus", type: "audio" },
          { key: "video", name: "demo.mp4", type: "video" },
          { key: "file", name: "report.pdf", type: "file" },
        ]}
      />,
    );

    const list = container.querySelector(
      '[data-slot="agent-message-attachments"]',
    );
    expect(list?.tagName).toBe("UL");
    expect(
      [...container.querySelectorAll('[data-slot="agent-message-attachment"]')]
        .map((item) => item.getAttribute("data-type")),
    ).toEqual(["image", "audio", "video", "file"]);
    expect(container.textContent).toContain("IMG");
    expect(container.textContent).toContain("AUD");
    expect(container.textContent).toContain("VID");
    expect(container.textContent).toContain("FILE");
    expect(container.textContent).toContain("screenshot.png");
    expect(container.querySelector("a")?.href).toBe(
      "https://example.com/screenshot.png",
    );
  });

  it("does not turn an unsafe attachment URL into a link", async () => {
    const container = await render(
      <MessageAttachmentList
        items={[
          {
            key: "unsafe",
            name: "unsafe.txt",
            type: "file",
            src: "javascript:alert(1)",
          },
        ]}
      />,
    );

    expect(container.textContent).toContain("unsafe.txt");
    expect(container.querySelector("a")).toBeNull();
  });

  it("renders source count, details, and safe links", async () => {
    const container = await render(
      <MessageSourceList
        items={[
          {
            key: "ag-ui",
            title: "AG-UI",
            url: "https://example.com/protocol",
            description: "Protocol reference",
          },
          { key: "runtime", title: "Runtime API" },
        ]}
      />,
    );

    expect(
      container.querySelector('[data-slot="agent-message-sources"]')?.tagName,
    ).toBe("SECTION");
    expect(
      container.querySelectorAll('[data-slot="agent-message-source"]'),
    ).toHaveLength(2);
    expect(container.textContent).toContain("2 个来源");
    expect(container.textContent).toContain("AG-UI");
    expect(container.textContent).toContain("Protocol reference");
    expect(container.querySelector("a")?.href).toBe(
      "https://example.com/protocol",
    );
  });

  it("does not turn an unsafe source URL into a link", async () => {
    const container = await render(
      <MessageSourceList
        items={[
          {
            key: "unsafe",
            title: "Unsafe source",
            url: "javascript:alert(1)",
          },
        ]}
      />,
    );

    expect(container.textContent).toContain("Unsafe source");
    expect(container.querySelector("a")).toBeNull();
  });

  it("owns empty, loading, and error announcements locally", async () => {
    const container = await render(
      <>
        <MessageEmptyState text="开始一段新对话" />
        <MessageLoadingState label="历史会话加载中" />
        <MessageErrorState message="历史会话不可用" />
      </>,
    );

    expect(
      container.querySelector('[data-slot="agent-message-empty"]')
        ?.textContent,
    ).toBe("开始一段新对话");
    const loading = container.querySelector(
      '[data-slot="agent-message-loading"]',
    );
    expect(loading?.getAttribute("role")).toBe("status");
    expect(loading?.textContent).toContain("历史会话加载中");
    expect(loading?.querySelector('[data-slot="spinner"]')).not.toBeNull();
    expect(
      loading?.querySelector('[data-slot="spinner"]')?.getAttribute("aria-label"),
    ).toBeNull();
    const error = container.querySelector('[data-slot="agent-message-error"]');
    expect(error?.getAttribute("role")).toBe("alert");
    expect(error?.textContent).toBe("历史会话不可用");
  });
});
