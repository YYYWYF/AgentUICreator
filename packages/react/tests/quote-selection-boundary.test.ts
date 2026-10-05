// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { getSelectionMessageId } from "../src/internal/quote-selection-message-id.js";
afterEach(() => { window.getSelection()?.removeAllRanges(); document.body.replaceChildren(); });
function select(start: Node, end: Node = start) {
  const range = document.createRange(); range.setStart(start, 0); range.setEnd(end, end.textContent!.length);
  const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range); return selection;
}
it("keeps upstream single-message, selectable, excluded-region and root scoping rules", () => {
  document.body.innerHTML = `<section id="thread"><article data-message-id="assistant" data-aui-quote-selectable="false"><p data-aui-quote-selectable="true">Body <button data-aui-quote-selectable="false">Control</button></p><div data-aui-quote-selectable="false">Tool JSON</div><div data-aui-quote-selectable="false">File Image</div></article><article data-message-id="other" data-aui-quote-selectable="false"><p data-aui-quote-selectable="true">Other body</p></article></section><section id="outside"></section>`;
  const body = document.querySelector("p")!.firstChild!;
  const paragraphs = document.querySelectorAll("p");
  const scope = document.querySelector("#thread")!;
  expect(getSelectionMessageId(select(body), scope)).toBe("assistant");
  expect(getSelectionMessageId(select(body), document.querySelector("#outside"))).toBeNull();
  expect(getSelectionMessageId(select(body, paragraphs[1]!.firstChild!), scope)).toBeNull();
  expect(getSelectionMessageId(select(document.querySelector("button")!.firstChild!), scope)).toBeNull();
  expect(getSelectionMessageId(select(document.querySelector("article > div")!.firstChild!), scope)).toBeNull();
  expect(getSelectionMessageId(select(document.querySelectorAll("article > div")[1]!.firstChild!), scope)).toBeNull();
  expect(getSelectionMessageId(select(body, document.querySelector("button")!.firstChild!), scope)).toBeNull();
});
