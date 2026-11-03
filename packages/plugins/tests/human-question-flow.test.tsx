// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { AgentUILocaleProvider } from "../src/locale.js";
import { HumanQuestionFlow } from "../src/plugins/ask-user-question/adapters/presentation/question-flow.js";
import { HumanQuestionFlow as PortableHumanQuestionFlow } from "../dist/sources/takeover/ask-user-question/adapters/question-flow";
import type { HumanQuestionStep } from "../src/plugins/ask-user-question/adapters/presentation/contract.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const labels = { back: "Back", next: "Next", submit: "Submit", submitting: "Submitting", answered: "Answered", noneSelected: "None", unavailable: "Please retry the answer" };
const options = [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }, { id: "c", label: "Gamma" }];
let root: Root | undefined, el: HTMLDivElement;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; el?.remove(); });
const flows = [{ name: "canonical", Flow: HumanQuestionFlow }, { name: "portable source", Flow: PortableHumanQuestionFlow }];
async function mount(steps: HumanQuestionStep[], complete: (answers: Record<string, string[]>) => void | Promise<void>, Flow = HumanQuestionFlow) {
  el = document.createElement("div"); document.body.append(el); root = createRoot(el);
  await act(async () => root!.render(<AgentUILocaleProvider><Flow steps={steps} labels={labels} onComplete={complete} /></AgentUILocaleProvider>));
}
function button(text: string) { const found = [...el.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === text); expect(found, `Missing button ${text}`).toBeDefined(); return found!; }
async function click(text: string) { await act(async () => button(text).click()); }
async function text(value: string) { await act(async () => { const input = el.querySelector("textarea")!; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); }); }

it.each(flows)("$name preserves mixed-choice answers and text drafts when navigating back", async ({ Flow }) => {
  const complete = vi.fn();
  await mount([
    { id: "one", question: "First", options, selectionMode: "single", minSelections: 1, maxSelections: 1 },
    { id: "two", question: "Second", options, selectionMode: "multiple", minSelections: 2, maxSelections: 2 },
    { id: "three", question: "Third", options: [], selectionMode: "text", minSelections: 1, maxSelections: 1 },
  ], complete, Flow);
  expect(el.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("1");
  await click("Alpha"); await click("Alpha"); await click("Beta"); await click("Next");
  await text("Keep this draft"); await click("Back");
  expect(el.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("2");
  expect(button("Alpha").getAttribute("aria-checked")).toBe("true"); expect(button("Beta").getAttribute("aria-checked")).toBe("true");
  await click("Beta"); await click("Gamma"); await click("Next");
  expect(el.querySelector("textarea")!.value).toBe("Keep this draft");
  await click("Submit");
  expect(complete).toHaveBeenCalledExactlyOnceWith({ one: ["a"], two: ["a", "c"], three: ["Keep this draft"] });
});

it.each(flows)("$name supports an optional empty text answer and retries a failed final choice", async ({ Flow }) => {
  const complete = vi.fn().mockRejectedValueOnce(new Error("internal failure")).mockResolvedValueOnce(undefined);
  await mount([
    { id: "optional", question: "Optional text", options: [], selectionMode: "text", minSelections: 0, maxSelections: 1 },
    { id: "choice", question: "Final choice", options, selectionMode: "single", minSelections: 1, maxSelections: 1 },
  ], complete, Flow);
  await click("Next"); await click("Beta");
  expect(el.querySelector('[role="alert"]')?.textContent).toBe(labels.unavailable);
  await click("Beta"); expect(complete).toHaveBeenCalledTimes(2);
  expect(complete).toHaveBeenLastCalledWith({ optional: [], choice: ["b"] });
});

it.each(flows)("$name prevents duplicate final text submissions and permits retry after failure", async ({ Flow }) => {
  let fail!: (error: Error) => void;
  const complete = vi.fn().mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { fail = reject; })).mockResolvedValueOnce(undefined);
  await mount([{ id: "text", question: "Required text", options: [], selectionMode: "text", minSelections: 1, maxSelections: 1 }], complete, Flow);
  expect(button("Submit").disabled).toBe(true); await text("Answer");
  await act(async () => { const form = el.querySelector("form")!; for (let index = 0; index < 2; index++) form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(complete).toHaveBeenCalledOnce();
  await act(async () => fail(new Error("internal failure")));
  expect(el.querySelector('[role="alert"]')?.textContent).toBe(labels.unavailable);
  await click("Submit"); expect(complete).toHaveBeenCalledTimes(2);
});
