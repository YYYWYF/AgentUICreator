import { describe, expect, it } from "vitest";
import { projectToolTimeline, timelineToolKind } from "../src/internal/tool-timeline-projection.js";
const tool = (id: string, status = "complete", extra = {}) => ({ type: "tool-call", toolCallId: id, toolName: "read_file", status: { type: status }, ...extra });
describe("message tool timeline projection", () => {
  it("T01 leaves plain answers without a timeline", () => {
    expect(projectToolTimeline([{ type: "text", text: "answer" }]).anchorId).toBeUndefined();
  });
  it("T02/T03 uses real identity, preserving same-name calls and append order", () => {
    const first = projectToolTimeline([tool("a", "running")]);
    const second = projectToolTimeline([tool("a"), tool("b", "running"), tool("c"), tool("b", "running")]);
    expect(second.calls.map(c => c.toolCallId)).toEqual(["a", "b", "c"]);
    expect(second.anchorId).toBe(first.anchorId);
    expect(second.streaming).toBe(true);
  });
  it("T04/T05 protects errors, cancellation and approval from hidden details", () => {
    const result = projectToolTimeline([tool("error", "incomplete", { status: { type: "incomplete", reason: "error" } }), tool("approval", "requires-action"), tool("cancel", "incomplete")]);
    expect(result.calls.every(call => call.protected)).toBe(true);
    expect(result.detailIndices).toEqual([]);
    expect(result.calls[0]?.reason).toBe("error");
    expect(result.streaming).toBe(false);
  });
  it("T06/T07 keeps named UIs, MCP apps and nested tasks out of ordinary summaries", () => {
    const result = projectToolTimeline([tool("a"), tool("b", "complete", { toolName: "chart" }), tool("task", "complete", { messages: [] }), tool("mcp", "complete", { mcp: {} })], { chart: [{}] });
    expect(result.summarized.map(c => c.toolCallId)).toEqual(["a"]);
  });
  it("T12 preserves real history state and never guesses completion", () => {
    expect(projectToolTimeline([tool("a", "unknown")]).calls[0]?.status).toBe("unknown");
    expect(projectToolTimeline([tool("a", "requires-action")]).calls[0]?.status).toBe("requires-action");
  });
  it("keeps interleaved text order and only anchors once", () => {
    const result = projectToolTimeline([{ type: "text", text: "before" }, tool("a"), { type: "text", text: "between" }, tool("b")]);
    expect(result.anchorId).toBe("a");
    expect(result.detailIndices).toEqual([1, 3]);
  });
  it("does not infer tool semantics from arbitrary names", () => {
    expect(timelineToolKind("read_file")).toBe("read");
    expect(timelineToolKind("exec_command")).toBe("command");
    expect(timelineToolKind("search_files")).toBe("search");
    expect(timelineToolKind("probably_read_secrets_and_search")).toBe("tool");
  });
});
