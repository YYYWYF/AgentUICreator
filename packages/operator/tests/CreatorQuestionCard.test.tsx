// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreatorQuestionCard } from "../src/ui/CreatorQuestionCard.js";
import { parseCreatorQuestion } from "../src/agent/creatorInterruptTypes.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
const question = parseCreatorQuestion({ kind: "question", id: "q1", interruptId: "i1", status: "pending",
  steps: [{ id: "layout", question: "Layout?", selectionMode: "single", minSelections: 1, maxSelections: 1,
    options: [{ id: "dashboard", label: "Dashboard" }, { id: "sidebar", label: "Sidebar" }] },
    { id: "features", question: "Features?", selectionMode: "multiple", minSelections: 1, maxSelections: 2,
      options: [{ id: "search", label: "Search" }, { id: "filter", label: "Filter" }] }],
})!;

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
});

describe("CreatorQuestionCard", () => {
  it("collects single and multiple selections once and renders a receipt", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    const onAnswer = vi.fn();
    const onAbandon = vi.fn();
    await act(async () => root.render(<CreatorQuestionCard activity={question} onAnswer={onAnswer} onAbandon={onAbandon} />));
    await act(async () => container.querySelectorAll("button")[1]?.click());
    expect(onAbandon).toHaveBeenCalledOnce();
    const submit = container.querySelector("button")!;
    expect(submit.disabled).toBe(true);
    await act(async () => { container.querySelectorAll("input")[0]?.click(); });
    await act(async () => { container.querySelectorAll("input")[2]?.click(); });
    expect(submit.disabled).toBe(false);
    await act(async () => submit.click());
    expect(onAnswer).toHaveBeenCalledWith({ layout: ["dashboard"], features: ["search"] });
    await act(async () => root.render(<CreatorQuestionCard activity={{ ...question, status: "resolved",
      answers: { layout: ["dashboard"], features: ["search"] } }} onAnswer={onAnswer} onAbandon={onAbandon} />));
    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(container.textContent).toContain("Dashboard");
    expect(container.textContent).not.toContain("Sidebar");
  });

  it("restores a submitting snapshot as pending after reload", () => {
    expect(parseCreatorQuestion({ ...question, status: "submitting" })?.status).toBe("pending");
  });
});
