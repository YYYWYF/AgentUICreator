import { describe, expect, it } from "vitest";
import { thinkingPresentation } from "../src/internal/thinking-indicator-policy.js";
const only = { reasoningVisible: false, timelineVisible: false };
const both = { reasoningVisible: true, timelineVisible: true };
const reasoning = { type: "reasoning", text: "private reasoning", status: { type: "running" } };
const tool = { type: "tool-call", toolCallId: "a", toolName: "read_file", status: { type: "running" } };
describe("thinking placeholder priority", () => {
  it("T08 remains visible while hidden reasoning streams without dropping its data", () => {
    expect(thinkingPresentation([], "running", only)).toBe("thinking");
    expect(thinkingPresentation([reasoning], "running", only)).toBe("thinking");
    expect(reasoning.text).toBe("private reasoning");
  });
  it("T09/T10 hands off only after real reasoning content arrives", () => {
    expect(thinkingPresentation([], "running", both)).toBe("thinking");
    expect(thinkingPresentation([{ ...reasoning, text: "" }], "running", both)).toBe("thinking");
    expect(thinkingPresentation([reasoning], "running", both)).toBeNull();
  });
  it("T11 yields to a live timeline and to dedicated tool UIs", () => {
    expect(thinkingPresentation([tool], "running", both)).toBeNull();
    expect(thinkingPresentation([tool], "running", only)).toBe("working");
    expect(thinkingPresentation([tool], "running", only, { read_file: [{}] })).toBeNull();
  });
  it("T05 never competes with approval or waiting input", () => {
    expect(thinkingPresentation([{ ...tool, status: { type: "requires-action" } }], "running", only)).toBeNull();
    expect(thinkingPresentation([{ ...tool, approval: { prompt: "Confirm" } }], "running", only)).toBeNull();
    expect(thinkingPresentation([tool], "requires-action", only)).toBeNull();
  });
  it("resumes placeholder after approval is resolved without losing the receipt", () => {
    const approved = { ...tool, status: { type: "complete" }, approval: { approved: true } };
    expect(thinkingPresentation([approved, reasoning], "running", only)).toBe("thinking");
  });
  it("T13 stops for completion, failure, cancellation and final answer text", () => {
    for (const status of ["complete", "incomplete", undefined]) expect(thinkingPresentation([reasoning], status, only)).toBeNull();
    expect(thinkingPresentation([{ type: "text", text: "answer" }, reasoning], "running", only)).toBeNull();
  });
});
