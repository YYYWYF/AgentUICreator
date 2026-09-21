import { agentStateSyncScenario } from "@agent-ui/mock-agent";
import type { MockScenario } from "@agent-ui/mock-agent";
import { describe, expect, it } from "vitest";

import { previewAgentState } from "../src/preview-data";
import { withPreviewAgentState } from "../src/mock-scenario-preview";

const scenarioWithoutState: MockScenario = {
  id: "scenario-a",
  title: "Scenario A",
  initialState: undefined,
  steps: [],
};

const scenarioWithState: MockScenario = {
  id: "scenario-b",
  title: "Scenario B",
  initialState: {
    trip: {
      destination: "Osaka",
    },
  },
  steps: [],
};

describe("Agent Frontend mock scenario preview state", () => {
  it("merges previewAgentState with scenario-owned initialState", () => {
    const [withPreviewState, withOwnedState] = [
      scenarioWithoutState,
      scenarioWithState,
    ].map(withPreviewAgentState);

    expect(withPreviewState.initialState).toEqual(previewAgentState);
    expect(withOwnedState.initialState).toEqual({
      ...previewAgentState,
      ...scenarioWithState.initialState,
    });

    expect(withPreviewAgentState(agentStateSyncScenario).initialState)
      .toMatchObject({
        selectedFile: previewAgentState.selectedFile,
        jobs: {
          "ci-job-1": {
            stageIndex: 0,
            stageProgress: 0.1,
          },
        },
      });
  });
});
