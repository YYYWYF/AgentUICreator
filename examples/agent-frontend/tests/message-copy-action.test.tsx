// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MessageCopyAction } from "../plugins/agent-message-list/message-copy-action";

const mountedRoots: Root[] = [];

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function renderCopyAction(text = "完整的智能体回复") {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);

  await act(async () => {
    root.render(<MessageCopyAction text={text} />);
  });

  const button = container.querySelector("button");
  if (button === null) {
    throw new Error("Copy action button was not rendered");
  }

  return { button, container, root };
}

async function click(button: HTMLButtonElement) {
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("MessageCopyAction", () => {
  it("starts with a low-emphasis copy action", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn(async () => undefined) },
    });

    const { button } = await renderCopyAction();

    expect(button.textContent).toBe("复制");
    expect(button.dataset.variant).toBe("ghost");
    expect(button.dataset.size).toBe("sm");
  });

  it("copies the supplied whole-turn text and resets success feedback", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { button } = await renderCopyAction("第一段\n\n第二段");

    await click(button);

    expect(writeText).toHaveBeenCalledWith("第一段\n\n第二段");
    expect(button.textContent).toBe("已复制");

    await act(async () => {
      vi.advanceTimersByTime(1_500);
    });
    expect(button.textContent).toBe("复制");
  });

  it("contains clipboard rejection and resets failure feedback", async () => {
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn(async () => {
          throw new Error("clipboard denied");
        }),
      },
    });
    const { button } = await renderCopyAction();

    await expect(click(button)).resolves.toBeUndefined();
    expect(button.textContent).toBe("复制失败");

    await act(async () => {
      vi.advanceTimersByTime(1_500);
    });
    expect(button.textContent).toBe("复制");
  });

  it("shows failure when the Clipboard API is unavailable", async () => {
    vi.stubGlobal("navigator", {});
    const { button } = await renderCopyAction();

    await expect(click(button)).resolves.toBeUndefined();

    expect(button.textContent).toBe("复制失败");
  });

  it("clears a pending reset when unmounted", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn(async () => undefined) },
    });
    const clearTimeout = vi.spyOn(window, "clearTimeout");
    const { button, root } = await renderCopyAction();
    await click(button);

    await act(async () => root.unmount());
    mountedRoots.splice(mountedRoots.indexOf(root), 1);

    expect(clearTimeout).toHaveBeenCalled();
  });

  it.each(["resolve", "reject"] as const)(
    "does not update state or schedule a reset when a pending copy %ss after unmount",
    async (settlement) => {
      const clipboardWrite = deferred<void>();
      vi.stubGlobal("navigator", {
        clipboard: { writeText: vi.fn(() => clipboardWrite.promise) },
      });
      const setTimeout = vi.spyOn(window, "setTimeout");
      const { button, root } = await renderCopyAction();

      await click(button);
      await act(async () => root.unmount());
      mountedRoots.splice(mountedRoots.indexOf(root), 1);
      setTimeout.mockClear();

      await act(async () => {
        if (settlement === "resolve") {
          clipboardWrite.resolve();
        } else {
          clipboardWrite.reject(new Error("clipboard denied after unmount"));
        }
        await clipboardWrite.promise.catch(() => undefined);
      });

      expect(setTimeout).not.toHaveBeenCalled();
    },
  );
});
