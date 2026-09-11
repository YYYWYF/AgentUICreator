// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  MessageEmptyState,
  MessageErrorState,
  MessageLoadingState,
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
  it("owns empty, loading, and error announcements locally", async () => {
    const container = await render(
      <>
        <MessageEmptyState text="开始一段新对话" />
        <MessageLoadingState label="历史会话加载中" />
        <MessageErrorState message="历史会话不可用" />
      </>,
    );

    expect(
      container.querySelector('[data-slot="agent-message-empty"]')?.textContent,
    ).toBe("开始一段新对话");
    const loading = container.querySelector('[data-slot="agent-message-loading"]');
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
