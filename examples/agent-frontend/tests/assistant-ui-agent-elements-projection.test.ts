import { describe, expect, it } from "vitest";

import {
  projectAgentPlan,
  projectAgentStatus,
  projectSubagentList,
  projectSubagentParts,
} from "../agent-ui/adapters/assistant-ui/agents";

describe("assistant-ui official agent element projections", () => {
  it("defensively projects plans and preserves empty plans", () => {
    expect(projectAgentPlan({ steps: ["Inspect", 1, "  ", "Test"], activeIndex: 1.9 })).toEqual({
      steps: ["Inspect", "Test"],
      activeIndex: 1,
    });
    expect(projectAgentPlan({ steps: [], activeIndex: -4 })).toEqual({
      steps: [],
      activeIndex: -4,
    });
    expect(projectAgentPlan({ steps: ["A"], activeIndex: Number.NaN })).toBeNull();
    expect(projectAgentPlan({ steps: ["A"], activeIndex: Number.POSITIVE_INFINITY })).toBeNull();
    expect(projectAgentPlan({ steps: ["A"] })).toBeNull();
    expect(projectAgentPlan(null)).toBeNull();
  });

  it("accepts explicit status semantics without inventing elapsed", () => {
    expect(projectAgentStatus({ state: "working", label: "Refactoring", elapsed: "0:12" })).toEqual({
      state: "working",
      label: "Refactoring",
      elapsed: "0:12",
    });
    expect(projectAgentStatus({ state: "waiting", label: "Waiting for approval" })).toEqual({
      state: "waiting",
      label: "Waiting for approval",
    });
    expect(projectAgentStatus({ state: "done", label: "Finished", elapsed: 12 })).toBeNull();
    expect(projectAgentStatus({ state: "working", label: "" })).toBeNull();
    expect(projectAgentStatus({ state: "working", label: "run_project_scan" })).toEqual({
      state: "working",
      label: "run_project_scan",
    });
  });

  it("requires the official SubagentList model and keeps stable completion order", () => {
    const parts = [
      { name: "Agent A", model: "model-x", status: "running" },
      { name: "Agent B", model: "model-y", status: "completed" },
      { name: "Agent C", model: "model-y", status: "running", progress: 30 },
    ];
    expect(projectSubagentList(parts)).toEqual({
      agents: [
        { name: "Agent A", model: "model-x" },
        { name: "Agent B", model: "model-y" },
        { name: "Agent C", model: "model-y" },
      ],
      progress: [0, 100, 30],
      completedCount: 0,
      showSummary: false,
      summaryAgent: { name: "", model: "" },
    });
    expect(projectSubagentList([
      { name: "Agent A", model: "model-x", status: "completed" },
      { name: "Agent B", model: "model-y", status: "completed" },
    ])?.completedCount).toBe(2);
    expect(projectSubagentList([
      { name: "Agent A", status: "running" },
    ])).toBeNull();
  });

  it("clamps real progress and routes malformed lifecycle parts to fallback", () => {
    expect(projectSubagentList([
      { name: "A", model: "m", status: "running", progress: -10 },
      { name: "B", model: "m", status: "running", progress: 150 },
      { name: "C", model: "m", status: "running", progress: Number.NaN },
    ])?.progress).toEqual([0, 100, 0]);
    const projected = projectSubagentParts([
      { name: "A", model: "m", status: "running" },
      { name: "Needs approval", model: "m", status: "requires-action" },
    ]);
    expect(projected.view?.agents).toEqual([{ name: "A", model: "m" }]);
    expect(projected.ineligibleParts).toHaveLength(1);
    expect(projectAgentStatus({ state: "done", label: "Finished" })).toEqual({
      state: "done",
      label: "Finished",
    });
  });
});
