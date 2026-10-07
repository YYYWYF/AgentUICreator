// @vitest-environment jsdom
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { AgentUIRoot } from "../src/internal/style-boundary/AgentUIRoot.js";
import { QuoteThreadRootContext } from "../src/internal/quote-thread-root.js";
import { SelectionToolbarPrimitiveRoot } from "../src/internal/quote-selection-root.js";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount()); root = undefined;
  window.getSelection()?.removeAllRanges(); document.body.replaceChildren();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
async function fixture() {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => window.setTimeout(() => cb(0), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => ({ top: 100, left: 100, width: 80 } as DOMRect) });
  const host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  const ref = createRef<HTMLDivElement>();
  const diagnostic = vi.fn();
  await act(async () => root!.render(<AgentUIRoot theme="light">
    <QuoteThreadRootContext.Provider value={ref}>
      <div ref={ref}>
        <article data-message-id="assistant" data-aui-quote-selectable="false"><p data-aui-quote-selectable="true">Body</p><button data-aui-quote-selectable="false">Control</button></article>
        <article data-message-id="other"><p data-aui-quote-selectable="true">Other</p></article>
        <SelectionToolbarPrimitiveRoot data-test-toolbar="" onSelectionDiagnostic={diagnostic}>Quote</SelectionToolbarPrimitiveRoot>
      </div>
    </QuoteThreadRootContext.Provider>
    <article data-message-id="outside"><p data-aui-quote-selectable="true">Outside</p></article>
  </AgentUIRoot>));
  async function select(start: Node, end = start, release = false) {
    const range = document.createRange(); range.setStart(start, 0); range.setEnd(end, end.textContent!.length);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    await act(async () => {
      document.dispatchEvent(new Event(release ? "mouseup" : "selectionchange"));
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  }
  return { host, ref, diagnostic, select, toolbar: () => host.querySelector("[data-test-toolbar]") };
}
it("observes every valid gate and mounts after mouse release; scroll closes stale geometry until reselection", async () => {
  const f = await fixture();
  document.dispatchEvent(new Event("mousedown"));
  await f.select(f.host.querySelector("p")!.firstChild!);
  expect(f.toolbar()).toBeNull();
  await f.select(f.host.querySelector("p")!.firstChild!, undefined, true);
  expect(f.diagnostic).toHaveBeenLastCalledWith({
    selectionExists: true, textNonEmpty: true, threadRefExists: true, threadElementExists: true,
    rootContainsMessage: true, messageId: "assistant", portalExists: true, infoWillBeSet: true,
  });
  expect(f.toolbar()?.closest("[data-agent-ui-portal-root]")).not.toBeNull();
  await act(async () => f.ref.current!.dispatchEvent(new Event("scroll")));
  expect(window.getSelection()!.toString()).toBe("Body");
  expect(f.toolbar()).toBeNull();
  await f.select(f.host.querySelector("p")!.firstChild!);
  expect(f.toolbar()).not.toBeNull();
  await act(async () => { window.getSelection()!.collapseToStart(); document.dispatchEvent(new Event("selectionchange")); });
  expect(f.toolbar()).toBeNull();
});
it("rejects excluded, cross-message and outside-thread selections", async () => {
  const f = await fixture(); const paragraphs = f.host.querySelectorAll("p");
  await f.select(f.host.querySelector("button")!.firstChild!); expect(f.toolbar()).toBeNull();
  await f.select(paragraphs[0]!.firstChild!, paragraphs[1]!.firstChild!); expect(f.toolbar()).toBeNull();
  await f.select(paragraphs[2]!.firstChild!); expect(f.toolbar()).toBeNull();
  expect(f.diagnostic).toHaveBeenLastCalledWith(expect.objectContaining({ rootContainsMessage: false, messageId: null, infoWillBeSet: false }));
});
