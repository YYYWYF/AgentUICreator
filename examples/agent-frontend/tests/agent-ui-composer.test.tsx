// @vitest-environment jsdom

import { act, type KeyboardEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AgentComposer,
  type AgentComposerInputProps,
  type AgentComposerProps,
} from "../agent-ui/components/composer";

const mountedRoots: Root[] = [];

async function renderComposer(overrides: Partial<AgentComposerProps> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  const props: AgentComposerProps = {
    value: "hello",
    onValueChange: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  };
  await act(async () => {
    root.render(<AgentComposer {...props} />);
  });
  return {
    container,
    props,
    textarea: container.querySelector("textarea") as HTMLTextAreaElement,
  };
}

function dispatchKey(
  element: HTMLElement,
  init: KeyboardEventInit,
  isComposing = false,
) {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  if (isComposing) {
    Object.defineProperty(event, "isComposing", { value: true });
  }
  element.dispatchEvent(event);
  return event;
}

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

describe("AgentComposer", () => {
  it("renders a controlled value, stable anatomy, and reports input changes", async () => {
    const onValueChange = vi.fn();
    const { container, textarea } = await renderComposer({
      value: "hello",
      onValueChange,
    });

    expect(textarea.value).toBe("hello");
    expect(container.querySelector('[data-slot="agent-composer"]')).toBeInstanceOf(HTMLFormElement);
    expect(container.querySelector('[data-slot="agent-composer-input"] textarea')).toBe(textarea);
    expect(container.querySelector('[data-slot="agent-composer-footer"]')).toBeInstanceOf(HTMLElement);
    expect(container.querySelector('[data-slot="agent-composer-actions"]')).toBeInstanceOf(HTMLElement);
    expect(container.querySelector('[data-slot="agent-composer-submit"]')).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(textarea, "hello world");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onValueChange).toHaveBeenCalledWith("hello world");
    expect(textarea.value).toBe("hello");
  });

  it("submits the authoritative value on Enter and prevents a newline", async () => {
    const onSubmit = vi.fn();
    const { textarea } = await renderComposer({ value: "  hello  ", onSubmit });
    let event!: KeyboardEvent;
    await act(async () => {
      event = dispatchKey(textarea, { key: "Enter" });
    });
    expect(event.defaultPrevented).toBe(true);
    expect(onSubmit).toHaveBeenCalledWith("  hello  ");
  });

  it("lets an external key handler prevent Composer submission", async () => {
    const onSubmit = vi.fn();
    const onInputKeyDown = vi.fn((event: KeyboardEvent<HTMLTextAreaElement>) => {
      event.preventDefault();
    });
    const { textarea } = await renderComposer({ onSubmit, onInputKeyDown });
    await act(async () => {
      dispatchKey(textarea, { key: "Enter" });
    });
    expect(onInputKeyDown).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("forwards generic input metadata without yielding controlled ownership", async () => {
    const onSubmit = vi.fn();
    const bypassKeyDown = vi.fn();
    const { textarea } = await renderComposer({
      value: "authoritative",
      onSubmit,
      inputProps: {
        "aria-controls": "test-list",
        "aria-expanded": true,
        "aria-activedescendant": "option-1",
        "aria-autocomplete": "list",
        value: "override",
        onKeyDown: bypassKeyDown,
      } as unknown as AgentComposerInputProps,
    });
    expect(textarea.value).toBe("authoritative");
    expect(textarea.getAttribute("aria-controls")).toBe("test-list");
    expect(textarea.getAttribute("aria-expanded")).toBe("true");
    expect(textarea.getAttribute("aria-activedescendant")).toBe("option-1");
    expect(textarea.getAttribute("aria-autocomplete")).toBe("list");
    await act(async () => {
      dispatchKey(textarea, { key: "Enter" });
    });
    expect(bypassKeyDown).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledWith("authoritative");
  });

  it("leaves Shift+Enter as a newline and does not submit", async () => {
    const onSubmit = vi.fn();
    const { textarea } = await renderComposer({ onSubmit });
    let event!: KeyboardEvent;
    await act(async () => {
      event = dispatchKey(textarea, { key: "Enter", shiftKey: true });
    });
    expect(event.defaultPrevented).toBe(false);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not submit an IME confirmation Enter", async () => {
    const onSubmit = vi.fn();
    const { textarea } = await renderComposer({ onSubmit });
    await act(async () => {
      dispatchKey(textarea, { key: "Enter" }, true);
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it.each(["", "   "])("disables submission for empty value %j", async (value) => {
    const onSubmit = vi.fn();
    const { container } = await renderComposer({ value, onSubmit });
    const button = container.querySelector(
      '[data-slot="agent-composer-submit"]',
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await act(async () => {
      (container.querySelector("form") as HTMLFormElement).requestSubmit();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("switches Send to Stop while running without submitting", async () => {
    const onSubmit = vi.fn();
    const onStop = vi.fn();
    const { container } = await renderComposer({ running: true, onSubmit, onStop });
    expect(container.querySelector('[data-slot="agent-composer-submit"]')).toBeNull();
    const stop = container.querySelector(
      '[data-slot="agent-composer-stop"]',
    ) as HTMLButtonElement;
    expect(stop.disabled).toBe(false);
    await act(async () => stop.click());
    expect(onStop).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not invent stop capability when the host omits onStop", async () => {
    const { container } = await renderComposer({ running: true });
    const stop = container.querySelector(
      '[data-slot="agent-composer-stop"]',
    ) as HTMLButtonElement;
    expect(stop.disabled).toBe(true);
    expect(stop.getAttribute("aria-label")).toBe("Generation in progress");
  });

  it("uses caller-provided accessible labels", async () => {
    const { container, textarea } = await renderComposer({
      labels: {
        input: "消息输入",
        send: "发送消息",
        stop: "停止生成",
        running: "正在生成",
      },
    });
    expect(textarea.getAttribute("aria-label")).toBe("消息输入");
    expect(container.querySelector('[data-slot="agent-composer-submit"]')?.getAttribute("aria-label"))
      .toBe("发送消息");
  });

  it("disables the textarea and keyboard submission", async () => {
    const onSubmit = vi.fn();
    const { container, textarea } = await renderComposer({ disabled: true, onSubmit });
    expect(textarea.disabled).toBe(true);
    expect((container.querySelector('[data-slot="agent-composer-submit"]') as HTMLButtonElement).disabled)
      .toBe(true);
    await act(async () => {
      dispatchKey(textarea, { key: "Enter" });
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("caps auto-resize height and enables internal scrolling", async () => {
    const { textarea } = await renderComposer();
    Object.defineProperty(textarea, "scrollHeight", {
      configurable: true,
      get: () => 260,
    });
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(textarea, "hello\nworld");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(textarea.style.height).toBe("192px");
    expect(textarea.style.maxHeight).toBe("192px");
    expect(textarea.style.overflowY).toBe("auto");
  });
});
