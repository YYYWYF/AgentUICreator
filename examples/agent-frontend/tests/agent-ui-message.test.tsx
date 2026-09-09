// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  AgentMessage,
  type AgentMessageProps,
} from "../agent-ui/components/message";
import { AgentUIRoot } from "../agent-ui/foundation/AgentUIRoot";

const mountedRoots: Root[] = [];

async function renderMessage(
  props: Partial<AgentMessageProps> & Pick<AgentMessageProps, "role">,
  children: ReactNode = "Hello",
) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => {
    root.render(
      <AgentUIRoot>
        <AgentMessage {...props}>{children}</AgentMessage>
      </AgentUIRoot>,
    );
  });
  const message = container.querySelector(
    '[data-slot="agent-message"]',
  ) as HTMLElement;
  return { container, message };
}

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

describe("AgentMessage", () => {
  it("renders the default semantic anatomy and content", async () => {
    const { message } = await renderMessage({ role: "assistant" });
    expect(message.tagName).toBe("ARTICLE");
    expect(message.dataset.role).toBe("assistant");
    expect(message.dataset.status).toBe("complete");
    expect(message.hasAttribute("aria-busy")).toBe(false);
    expect(message.querySelector('[data-slot="agent-message-body"]')).not.toBeNull();
    expect(message.querySelector('[data-slot="agent-message-content"]')?.textContent)
      .toBe("Hello");
  });

  it.each(["user", "assistant", "system"] as const)(
    "projects the %s presentation role",
    async (role) => {
      const { message } = await renderMessage({ role });
      expect(message.dataset.role).toBe(role);
    },
  );

  it("exposes streaming state without inventing loading UI", async () => {
    const { message } = await renderMessage({ role: "assistant", status: "streaming" });
    expect(message.dataset.status).toBe("streaming");
    expect(message.getAttribute("aria-busy")).toBe("true");
    expect(message.querySelector('[data-slot*="spinner"]')).toBeNull();
    expect(message.textContent).toBe("Hello");
  });

  it("exposes error state without inventing error copy or retry behavior", async () => {
    const { message } = await renderMessage(
      { role: "assistant", status: "error" },
      "Partial response",
    );
    expect(message.dataset.status).toBe("error");
    expect(message.textContent).toBe("Partial response");
    expect(message.textContent).not.toMatch(/error|retry/iu);
    expect(message.querySelector("button")).toBeNull();
  });

  it("omits optional slot DOM until the caller provides it", async () => {
    const { message } = await renderMessage({ role: "assistant" });
    for (const slot of [
      "agent-message-avatar",
      "agent-message-header",
      "agent-message-footer-row",
      "agent-message-footer",
      "agent-message-actions",
    ]) {
      expect(message.querySelector(`[data-slot="${slot}"]`)).toBeNull();
    }
  });

  it("renders every caller-controlled optional slot", async () => {
    const { message } = await renderMessage({
      role: "assistant",
      avatar: <span>AI</span>,
      header: <span>Assistant</span>,
      footer: <span>Just now</span>,
      actions: <button type="button">Copy</button>,
    });
    expect(message.querySelector('[data-slot="agent-message-avatar"]')?.textContent)
      .toBe("AI");
    expect(message.querySelector('[data-slot="agent-message-header"]')?.textContent)
      .toBe("Assistant");
    expect(message.querySelector('[data-slot="agent-message-footer-row"]')).not.toBeNull();
    expect(message.querySelector('[data-slot="agent-message-footer"]')?.textContent)
      .toBe("Just now");
    expect(message.querySelector('[data-slot="agent-message-actions"] button')?.textContent)
      .toBe("Copy");
  });

  it("preserves arbitrary React children", async () => {
    const { message } = await renderMessage(
      { role: "assistant" },
      <div data-testid="custom-part">Custom part</div>,
    );
    expect(message.querySelector('[data-testid="custom-part"]')?.textContent)
      .toBe("Custom part");
  });

  it("merges a host class with its internal CSS Module class", async () => {
    const { message } = await renderMessage({
      role: "assistant",
      className: "host-message",
    });
    expect(message.classList.contains("host-message")).toBe(true);
    expect(message.classList.length).toBeGreaterThan(1);
  });

  it("uses only a caller-provided accessible label", async () => {
    const labeled = await renderMessage({
      role: "assistant",
      ariaLabel: "Assistant response",
    });
    expect(labeled.message.getAttribute("aria-label")).toBe("Assistant response");

    const unlabeled = await renderMessage({ role: "user" });
    expect(unlabeled.message.hasAttribute("aria-label")).toBe(false);
  });
});
