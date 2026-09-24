import { describe, expect, it } from "vitest";

import {
  projectAgentPlan,
  projectAgentStatus,
} from "../agent-ui/conversation/agents";

describe("assistant-ui AgentPlan and AgentStatus projections", () => {
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

  it("derives status state from ToolCall lifecycle and keeps args presentation data", () => {
    expect(projectAgentStatus(
      { label: "Refactoring", elapsed: "0:12" },
      { type: "running" },
    )).toEqual({
      state: "working",
      label: "Refactoring",
      elapsed: "0:12",
    });
    expect(projectAgentStatus(
      { label: "Waiting for approval" },
      { type: "requires-action" },
    )).toEqual({
      state: "waiting",
      label: "Waiting for approval",
    });
    expect(projectAgentStatus(
      { label: "Finished", elapsed: "0:24" },
      { type: "complete" },
    )).toEqual({
      state: "done",
      label: "Finished",
      elapsed: "0:24",
    });
    expect(projectAgentStatus({ label: "Finished" }, { type: "incomplete" })).toBeNull();
    expect(projectAgentStatus({ label: "" }, { type: "running" })).toBeNull();
    expect(projectAgentStatus({ label: "run_project_scan" }, { type: "running" })).toEqual({
      state: "working",
      label: "run_project_scan",
    });
  });

});
