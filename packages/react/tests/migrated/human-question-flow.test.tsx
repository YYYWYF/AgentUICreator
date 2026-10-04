// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConversationOptionList, ConversationQuestionFlow, type ConversationQuestionStep } from "../../src/index";
import { AskUserQuestionToolUI } from "../../../source-registry/registry/items/demo-ask-user-question/files/agent-ui/conversation/human-tool-uis/ask-user-question";

const state = vi.hoisted(() => ({ canAnswer: true }));
vi.mock("@agent-ui/react", async importOriginal => ({
  ...await importOriginal<object>(),
  useConversationCanAnswerToolCall: () => state.canAnswer,
}));
vi.mock("../../../source-registry/registry/items/foundation-core-adapters/files/agent-ui/i18n/useAgentUILocale", () => ({
  useAgentUILocale: () => labels,
}));

const labels = { back: "Back", next: "Next", submit: "Submit", submitting: "Submitting", answered: "Selected", noneSelected: "No selection", unavailable: "Unavailable" };
const roots: Root[] = [];
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
function render(element: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  return act(async () => root.render(element)).then(() => host);
}
async function click(element: Element | null) {
  expect(element).not.toBeNull();
  await act(async () => { (element as HTMLElement).click(); await Promise.resolve(); });
}
function option(host: HTMLElement, label: string) {
  return [...host.querySelectorAll("[data-slot=option-list] button")].find(button => button.textContent?.includes(label)) ?? null;
}
const steps: ConversationQuestionStep[] = [
  { id: "layout", question: "Layout?", options: [{ id: "dashboard", label: "Dashboard" }, { id: "chat", label: "Chat" }], selectionMode: "single", minSelections: 1, maxSelections: 1 },
  { id: "features", question: "Features?", options: [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }, { id: "c", label: "Gamma" }], selectionMode: "multiple", minSelections: 1, maxSelections: 2 },
];
afterEach(async () => {
  await act(async () => { roots.splice(0).forEach(root => root.unmount()); });
  document.body.replaceChildren();
  state.canAnswer = true;
});

describe("human question public presentation", () => {
  it("confirms a single option once", async () => {
    const onConfirm = vi.fn();
    const host = await render(<ConversationOptionList options={steps[0]!.options} onConfirm={onConfirm} />);
    await click(option(host, "Dashboard"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(["dashboard"]);
  });
  it("enforces the multiple maximum and confirms in option order", async () => {
    const onConfirm = vi.fn();
    const host = await render(<ConversationOptionList options={steps[1]!.options} selectionMode="multiple" minSelections={1} maxSelections={2} onConfirm={onConfirm} confirmLabel="Submit" />);
    await click(option(host, "Beta"));
    await click(option(host, "Alpha"));
    expect(option(host, "Gamma")?.getAttribute("aria-disabled")).toBe("true");
    await click(option(host, "Gamma"));
    await click([...host.querySelectorAll("button")].find(button => button.textContent === "Submit") ?? null);
    expect(onConfirm).toHaveBeenCalledWith(["a", "b"]);
  });
  it("retains an earlier answer on Back and completes only at the final step", async () => {
    const onComplete = vi.fn();
    const host = await render(<ConversationQuestionFlow steps={steps} labels={labels} onComplete={onComplete} />);
    await click(option(host, "Dashboard"));
    expect(onComplete).not.toHaveBeenCalled();
    await click([...host.querySelectorAll("button")].find(button => button.textContent === "Back") ?? null);
    expect(option(host, "Dashboard")).not.toBeNull();
    await click(option(host, "Dashboard"));
    await click(option(host, "Alpha"));
    await click([...host.querySelectorAll("button")].find(button => button.textContent === "Submit") ?? null);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith({ layout: ["dashboard"], features: ["a"] });
  });
  it("renders a final receipt without answer controls", async () => {
    const host = await render(<ConversationQuestionFlow steps={steps} labels={labels} choice={{ layout: ["dashboard"], features: ["b"] }} />);
    expect(host.textContent).toContain("Dashboard");
    expect(host.textContent).toContain("Beta");
    expect(host.querySelector("button")).toBeNull();
  });
  it("keeps the existing zero-selection single-step contract", async () => {
    const onComplete = vi.fn();
    const optional = { ...steps[0]!, minSelections: 0 };
    const host = await render(<ConversationQuestionFlow steps={[optional]} labels={labels} onComplete={onComplete} />);
    await click([...host.querySelectorAll("button")].find(button => button.textContent === "Submit") ?? null);
    expect(onComplete).toHaveBeenCalledWith({ layout: [] });
  });
});

describe("ask_user_question Tool UI", () => {
  const request = { steps: [steps[0]] };
  const base = { toolCallId: "call-1", toolName: "ask_user_question", args: request, status: { type: "requires-action" as const } };
  it("submits the existing result contract once when answer capability is granted", async () => {
    const addResult = vi.fn();
    const host = await render(<AskUserQuestionToolUI {...base} addResult={addResult} />);
    await click(option(host, "Dashboard"));
    expect(addResult).toHaveBeenCalledTimes(1);
    expect(addResult).toHaveBeenCalledWith({ answers: { layout: ["dashboard"] } });
  });
  it("submits three steps with a bounded multiple selection only after the last step", async () => {
    const addResult = vi.fn();
    const third: ConversationQuestionStep = { id: "tone", question: "Tone?", options: [
      { id: "brief", label: "Brief" }, { id: "detailed", label: "Detailed" },
    ], selectionMode: "single", minSelections: 1, maxSelections: 1 };
    const host = await render(<AskUserQuestionToolUI {...base} args={{ steps: [...steps, third] }} addResult={addResult} />);
    await click(option(host, "Dashboard"));
    expect(addResult).not.toHaveBeenCalled();
    await click(option(host, "Alpha"));
    await click(option(host, "Beta"));
    expect(option(host, "Gamma")?.getAttribute("aria-disabled")).toBe("true");
    await click([...host.querySelectorAll("button")].find(button => button.textContent === "Next") ?? null);
    expect(addResult).not.toHaveBeenCalled();
    await click(option(host, "Brief"));
    expect(addResult).toHaveBeenCalledTimes(1);
    expect(addResult).toHaveBeenCalledWith({ answers: {
      layout: ["dashboard"], features: ["a", "b"], tone: ["brief"],
    } });
  });
  it("shows a readonly request without answer controls or continuation", async () => {
    state.canAnswer = false;
    const addResult = vi.fn();
    const host = await render(<AskUserQuestionToolUI {...base} addResult={addResult} />);
    expect(host.textContent).toContain("Dashboard");
    expect(host.querySelector("button")).toBeNull();
    expect(addResult).not.toHaveBeenCalled();
  });
  it("shows only the stored result on history and rejects malformed input", async () => {
    const host = await render(<AskUserQuestionToolUI {...base} result={{ answers: { layout: ["chat"] } }} />);
    expect(host.textContent).toContain("Chat");
    expect(host.textContent).not.toContain("Dashboard");
    expect(host.querySelector("button")).toBeNull();
    const invalid = await render(<AskUserQuestionToolUI {...base} args={{ steps: [] }} />);
    expect(invalid.textContent).toBe("Unavailable");
    const invalidResult = await render(<AskUserQuestionToolUI {...base} result={{ answers: { layout: ["missing"] } }} />);
    expect(invalidResult.textContent).toBe("Unavailable");
  });
});
