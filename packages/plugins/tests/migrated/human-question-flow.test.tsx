// @vitest-environment jsdom
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConversationOptionList, ConversationQuestionFlow, type ConversationQuestionStep } from "../../src/index";
import { parseHumanQuestionRequest, parseHumanQuestionResult } from "../../resources/registry/items/demo-ask-user-question/files/agent-contract/human-tools/ask-user-question";
import { AskUserQuestionToolUI } from "../../resources/registry/items/demo-ask-user-question/files/agent-ui/conversation/human-tool-uis/ask-user-question";

const state = vi.hoisted(() => ({ canAnswer: true }));
vi.mock("@za38.03/agent-ui-plugins", async importOriginal => ({
  ...await importOriginal<object>(),
  useConversationCanAnswerToolCall: () => state.canAnswer,
}));
vi.mock("../../resources/registry/items/foundation-core-adapters/files/agent-ui/i18n/useAgentUILocale", () => ({
  useAgentUILocale: () => labels,
}));

const labels = { back: "Back", next: "Next", submit: "Submit", submitting: "Submitting", answered: "Selected", noneSelected: "No selection", unavailable: "Unavailable" };
const roots: Root[] = [];
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
async function render(element: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(element));
  return host;
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
  it("locks Back while final completion is pending and keeps the receipt handoff locked", async () => {
    let resolveComplete!: () => void;
    const onComplete = vi.fn(() => new Promise<void>(resolve => { resolveComplete = resolve; }));
    const host = await render(<ConversationQuestionFlow steps={steps} labels={labels} onComplete={onComplete} />);
    await click(option(host, "Dashboard"));
    await click(option(host, "Alpha"));
    await click([...host.querySelectorAll("button")].find(button => button.textContent === "Submit") ?? null);
    const back = [...host.querySelectorAll("button")].find(button => button.textContent === "Back") as HTMLButtonElement;
    expect(back.disabled).toBe(true);
    expect(host.textContent).toContain("Submitting");
    await click(back);
    expect(host.textContent).toContain("Features?");
    expect(onComplete).toHaveBeenCalledTimes(1);
    await act(async () => resolveComplete());
    expect(back.disabled).toBe(true);
    expect(host.querySelector('[data-slot="option-list"]')?.getAttribute("data-state")).toBe("pending");
  });
  it("keeps completion pending until the Tool Result choice renders the receipt", async () => {
    let showReceipt!: () => void;
    function Harness() {
      const [choice, setChoice] = useState<Readonly<Record<string, readonly string[]>> | undefined>();
      showReceipt = () => setChoice({ layout: ["dashboard"], features: ["a"] });
      return <ConversationQuestionFlow steps={steps} labels={labels} choice={choice} onComplete={() => {}} />;
    }
    const host = await render(<Harness />);
    await click(option(host, "Dashboard"));
    await click(option(host, "Alpha"));
    await click([...host.querySelectorAll("button")].find(button => button.textContent === "Submit") ?? null);
    expect(host.querySelector('[data-slot="option-list"]')?.getAttribute("data-state")).toBe("pending");
    await act(async () => showReceipt());
    expect(host.querySelector('[data-state="receipt"]')).not.toBeNull();
    expect(host.querySelector("button")).toBeNull();
  });
  it("restores answer controls and Back after final completion rejects", async () => {
    let rejectComplete!: (error: Error) => void;
    const onComplete = vi.fn(() => new Promise<void>((_, reject) => { rejectComplete = reject; }));
    const host = await render(<ConversationQuestionFlow steps={steps} labels={labels} onComplete={onComplete} />);
    await click(option(host, "Dashboard"));
    await click(option(host, "Alpha"));
    await click([...host.querySelectorAll("button")].find(button => button.textContent === "Submit") ?? null);
    const back = [...host.querySelectorAll("button")].find(button => button.textContent === "Back") as HTMLButtonElement;
    expect(back.disabled).toBe(true);
    await act(async () => { rejectComplete(new Error("failed")); await Promise.resolve(); });
    expect(back.disabled).toBe(false);
    expect(host.textContent).toContain("Submit");
    await click(back);
    expect(host.textContent).toContain("Layout?");
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


describe("human tool text question contract", () => {
  const request = { steps: [{ id: "notes", question: "Requirements?", selectionMode: "text", options: [], minSelections: 1, maxSelections: 1 }] };
  it("accepts bounded free text and rejects empty or oversized answers", () => {
    const parsed = parseHumanQuestionRequest(request)!;
    expect(parsed).toBeDefined();
    expect(parseHumanQuestionResult({ answers: { notes: ["Use Docker"] } }, parsed)).toBeDefined();
    expect(parseHumanQuestionResult({ answers: { notes: ["   "] } }, parsed)).toBeUndefined();
    expect(parseHumanQuestionResult({ answers: { notes: ["x".repeat(4001)] } }, parsed)).toBeUndefined();
  });
  it("does not submit through the old interrupt channel", async () => {
    const resumeInterrupt = vi.fn();
    const host = await render(<AskUserQuestionToolUI toolCallId="text-call" toolName="ask_user_question"
      args={request} status={{ type: "requires-action" }} resumeInterrupt={resumeInterrupt} />);
    expect(host.querySelector("textarea")).toBeNull();
    expect(host.querySelector("button")).toBeNull();
    expect(resumeInterrupt).not.toHaveBeenCalled();
  });
  it("shows an accessible required text control and resumes with text answers", async () => {
    const addResult = vi.fn(async () => {});
    const host = await render(<AskUserQuestionToolUI toolCallId="text-call" toolName="ask_user_question"
      args={request} status={{ type: "requires-action" }} addResult={addResult} />);
    const textarea = host.querySelector("textarea")!;
    expect(textarea.required).toBe(true);
    expect(textarea.maxLength).toBe(4000);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "Docker");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(addResult).toHaveBeenCalledWith({ answers: { notes: ["Docker"] } });
    expect(addResult).toHaveBeenCalledTimes(1);
  });
  it("combines text and option steps in one tool result", async () => {
    const addResult = vi.fn(async () => {});
    const host = await render(<AskUserQuestionToolUI toolCallId="mixed-call" toolName="ask_user_question"
      args={{ steps: [...request.steps, steps[0]] }} status={{ type: "requires-action" }} addResult={addResult} />);
    const textarea = host.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "Docker");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(addResult).not.toHaveBeenCalled();
    await click(option(host, "Dashboard"));
    expect(addResult).toHaveBeenCalledWith({ answers: { notes: ["Docker"], layout: ["dashboard"] } });
  });

  it("surfaces a rejected text submission through localized feedback", async () => {
    const addResult = vi.fn(() => { throw new Error("transport failure"); });
    const host = await render(<AskUserQuestionToolUI toolCallId="failed-call" toolName="ask_user_question"
      args={request} status={{ type: "requires-action" }} addResult={addResult} />);
    await act(async () => {
      const textarea = host.querySelector("textarea")!;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "Docker");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(host.querySelector("[role=alert]")?.textContent).toBe(labels.unavailable);
    expect(host.querySelector("textarea")?.disabled).toBe(false);
  });

});
