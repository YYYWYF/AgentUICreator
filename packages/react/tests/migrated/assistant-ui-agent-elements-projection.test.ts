import { describe, expect, it } from "vitest";

import { projectAgentPlanActivity } from "../../../source-registry/registry/items/foundation-core-application/files/agent-contract/agent-plan-activity";
import { projectAgentStatus } from "../../../source-registry/registry/items/foundation-core-adapters/files/agent-ui/conversation/agents/index";

describe("assistant-ui AgentPlan and AgentStatus projections", () => {
  it("projects only complete Agent Plan activity without filling missing data", () => {
    expect(projectAgentPlanActivity({
      title: "Workspace update",
      steps: [
        { id: "inspect", label: "Inspect", description: "Read the active path." },
        { label: "Update" },
      ],
      activeIndex: 1,
    })).toEqual({
      title: "Workspace update",
      steps: [
        { id: "inspect", label: "Inspect", description: "Read the active path." },
        { label: "Update" },
      ],
      activeIndex: 1,
    });
    expect(projectAgentPlanActivity({ steps: [], activeIndex: 0 })).toEqual({
      steps: [],
      activeIndex: 0,
    });
    expect(projectAgentPlanActivity({ steps: [{ label: "A" }], activeIndex: 1 }))
      .toEqual({ steps: [{ label: "A" }], activeIndex: 1 });
  });

  it.each([
    null,
    { steps: ["Inspect"], activeIndex: 0 },
    { steps: [{ label: "Inspect" }] },
    { steps: [{ label: "Inspect" }], activeIndex: 1.5 },
    { steps: [{ label: "Inspect" }], activeIndex: -1 },
    { steps: [{ label: "Inspect" }], activeIndex: 2 },
    { steps: [{ description: "missing label" }], activeIndex: 0 },
    { steps: [{ label: "  " }], activeIndex: 0 },
    { steps: [{ label: "Inspect", id: 3 }], activeIndex: 0 },
    { steps: [{ label: "Inspect", id: " " }], activeIndex: 0 },
    { steps: [{ label: "Inspect", description: 4 }], activeIndex: 0 },
    { title: 3, steps: [], activeIndex: 0 },
  ])("returns null for incomplete or invalid Agent Plan activity %#", value => {
    expect(projectAgentPlanActivity(value)).toBeNull();
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
